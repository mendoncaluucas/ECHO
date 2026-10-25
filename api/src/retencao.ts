import { prisma } from "./prisma.js";
import { registrarAuditoria } from "./auditoria.js";
import { ID_DA_CONFIGURACAO, lerConfiguracoes, type Configuracoes } from "./configuracao.js";

// Retenção de dados (LGPD). Ver docs/PROXIMOS-PASSOS.md, seção 6.
//
// Anonimiza, não apaga: o feedback fica (tipo, notas, área, data e situação não
// identificam ninguém e sustentam os painéis e relatórios); some só o que identifica.
//   - nome e e-mail de quem pediu resposta, depois de `retencaoContatoDias`, junto com o
//     texto das respostas que a equipe mandou (dirigidas a ele, costumam trazer o nome)
//   - o comentário (texto livre, pode trazer nome, telefone, placa), depois de
//     `retencaoComentarioDias`
//   - as notificações (apontam para o feedback), depois de `retencaoNotificacaoDias`
// Os prazos contam da data do feedback (ou da notificação), não da tratativa.
//
// Idempotente: o que já foi anonimizado não entra de novo na conta. O log guarda só as
// contagens, nunca o conteúdo apagado.

const MS_POR_DIA = 24 * 60 * 60 * 1000;

// No máximo uma rodada automática por dia (ver aplicarRetencaoSeDevido).
export const INTERVALO_ENTRE_RODADAS_MS = MS_POR_DIA;

export interface ResultadoDaRetencao {
  contatos: number;
  comentarios: number;
  notificacoes: number;
  respostas: number;
}

type Prazos = Pick<
  Configuracoes,
  "retencaoContatoDias" | "retencaoComentarioDias" | "retencaoNotificacaoDias"
>;

// Vencido é o que foi criado antes de `agora - prazo`: com 90 dias, o feedback de
// exatamente 90 dias atrás ainda fica; o de 90 dias e 1 ms já sai.
function limites(agora: Date, prazos: Prazos) {
  const antesDe = (dias: number) => new Date(agora.getTime() - dias * MS_POR_DIA);
  return {
    contato: antesDe(prazos.retencaoContatoDias),
    comentario: antesDe(prazos.retencaoComentarioDias),
    notificacao: antesDe(prazos.retencaoNotificacaoDias),
  };
}

// Cada filtro olha só o que ainda tem o dado: é isso que torna a rotina idempotente e
// a prévia exata.
function filtros(agora: Date, prazos: Prazos) {
  const limite = limites(agora, prazos);
  return {
    contato: {
      criadoEm: { lt: limite.contato },
      OR: [{ contatoNome: { not: null } }, { contatoEmail: { not: null } }],
    },
    comentario: { criadoEm: { lt: limite.comentario }, comentario: { not: null } },
    notificacao: { criadoEm: { lt: limite.notificacao } },
    // Pela data do feedback, como o contato: o prazo é o mesmo.
    resposta: { texto: { not: null }, feedback: { criadoEm: { lt: limite.contato } } },
  };
}

// Quanto sairia agora, sem mudar nada. Para a tela de configurações.
export async function previaDaRetencao(agora = new Date()): Promise<ResultadoDaRetencao> {
  const f = filtros(agora, await lerConfiguracoes());
  const [contatos, comentarios, notificacoes, respostas] = await Promise.all([
    prisma.feedback.count({ where: f.contato }),
    prisma.feedback.count({ where: f.comentario }),
    prisma.notification.count({ where: f.notificacao }),
    prisma.resposta.count({ where: f.resposta }),
  ]);
  return { contatos, comentarios, notificacoes, respostas };
}

// Aplica os prazos. `usuarioId` null é a rodada automática (o log mostra "Sistema"),
// que só registra quando algo saiu, para não encher o log de "nada a fazer" todo dia.
// Quem aplica pela tela registra sempre: alguém agiu.
export async function aplicarRetencao({
  usuarioId,
  agora = new Date(),
}: {
  usuarioId: string | null;
  agora?: Date;
}): Promise<ResultadoDaRetencao> {
  const prazos = await lerConfiguracoes();
  const f = filtros(agora, prazos);

  return prisma.$transaction(async (tx) => {
    const contatos = await tx.feedback.updateMany({
      where: f.contato,
      data: { contatoNome: null, contatoEmail: null, contatoApagadoEm: agora },
    });
    const comentarios = await tx.feedback.updateMany({
      where: f.comentario,
      data: { comentario: null, comentarioApagadoEm: agora },
    });
    const notificacoes = await tx.notification.deleteMany({ where: f.notificacao });
    const respostas = await tx.resposta.updateMany({
      where: f.resposta,
      data: { texto: null, textoApagadoEm: agora },
    });

    const resultado = {
      contatos: contatos.count,
      comentarios: comentarios.count,
      notificacoes: notificacoes.count,
      respostas: respostas.count,
    };

    // A linha só existe depois que alguém salvou algo. Criar ignorando a existente, e
    // não upsert: duas aplicações ao mesmo tempo não quebram com chave duplicada.
    await tx.configuracao.createMany({ data: [{ id: ID_DA_CONFIGURACAO }], skipDuplicates: true });
    await tx.configuracao.update({
      where: { id: ID_DA_CONFIGURACAO },
      data: { ultimaRetencaoEm: agora },
    });

    const algoSaiu =
      resultado.contatos + resultado.comentarios + resultado.notificacoes + resultado.respostas > 0;
    if (usuarioId !== null || algoSaiu) {
      await registrarAuditoria(tx, {
        acao: "RETENCAO_APLICADA",
        usuarioId,
        entidade: "Configuracao",
        entidadeId: ID_DA_CONFIGURACAO,
        detalhes: {
          ...resultado,
          // Os prazos da vez: mudam com o tempo, e o log precisa dizer qual regra valeu.
          prazos: {
            contatoDias: prazos.retencaoContatoDias,
            comentarioDias: prazos.retencaoComentarioDias,
            notificacaoDias: prazos.retencaoNotificacaoDias,
          },
        },
      });
    }

    return resultado;
  });
}

// A rodada automática, chamada ao ligar a API e de hora em hora enquanto ela está de
// pé (ver server.ts). O Render gratuito não tem agendador e dorme depois de 15 min
// parado; a API acorda a cada uso, então isto roda todo dia com movimento.
//
// "Reserva" a rodada antes de rodar: só quem consegue trocar a `ultimaRetencaoEm`
// velha (ou vazia) pela de agora segue. Duas chamadas ao mesmo tempo (ou duas
// instâncias) não aplicam duas vezes.
//
// Devolve null quando não era hora.
export async function aplicarRetencaoSeDevido(agora = new Date()): Promise<ResultadoDaRetencao | null> {
  // A linha pode ainda não existir. createMany com skipDuplicates é um INSERT ... ON
  // CONFLICT DO NOTHING: com duas rodadas ao mesmo tempo, um upsert faria a segunda
  // quebrar com chave duplicada (visto no teste de concorrência).
  await prisma.configuracao.createMany({ data: [{ id: ID_DA_CONFIGURACAO }], skipDuplicates: true });

  const { ultimaRetencaoEm: anterior } = await prisma.configuracao.findUniqueOrThrow({
    where: { id: ID_DA_CONFIGURACAO },
    select: { ultimaRetencaoEm: true },
  });

  const reserva = await prisma.configuracao.updateMany({
    where: {
      id: ID_DA_CONFIGURACAO,
      OR: [
        { ultimaRetencaoEm: null },
        { ultimaRetencaoEm: { lte: new Date(agora.getTime() - INTERVALO_ENTRE_RODADAS_MS) } },
      ],
    },
    data: { ultimaRetencaoEm: agora },
  });
  if (reserva.count === 0) return null;

  try {
    return await aplicarRetencao({ usuarioId: null, agora });
  } catch (erro) {
    // Falhou depois de reservar: devolve a data anterior, senão o dia ficaria sem
    // retenção (a próxima tentativa só viria 24h depois).
    await prisma.configuracao.updateMany({
      where: { id: ID_DA_CONFIGURACAO, ultimaRetencaoEm: agora },
      data: { ultimaRetencaoEm: anterior },
    });
    throw erro;
  }
}

// Pedido do titular (LGPD, art. 18): anonimiza na hora todos os feedbacks daquele
// e-mail, contato, comentário e o texto das respostas, sem esperar prazo. Sem diferenciar maiúsculas: o
// cliente pode ter digitado "Ana@Email.com". O log guarda só a quantidade; o e-mail
// não fica em lugar nenhum.
export async function apagarDadosDoTitular({
  email,
  usuarioId,
  agora = new Date(),
}: {
  email: string;
  usuarioId: string;
  agora?: Date;
}): Promise<{ feedbacks: number }> {
  return prisma.$transaction(async (tx) => {
    // Comparação exata, sem diferenciar maiúsculas, em SQL parametrizado. Não o
    // `mode: "insensitive"` do Prisma: no Postgres ele vira ILIKE sem escapar os
    // curingas, e o pedido de "a_b@x.com" apagava também o de "aXb@x.com"; o de "%@%",
    // o de todo mundo (visto num teste).
    const feedbacks = await tx.$queryRaw<{ id: string; temComentario: boolean }[]>`
      SELECT "id", ("comentario" IS NOT NULL) AS "temComentario"
      FROM "Feedback"
      WHERE lower("contatoEmail") = lower(${email.trim()})
    `;
    const ids = (comComentario: boolean) =>
      feedbacks.filter((f) => f.temComentario === comComentario).map((f) => f.id);

    // Dois lotes, não um update por feedback: a transação do Prisma corta em 5 s, e com
    // o banco remoto cada ida leva dezenas de milissegundos. O comentário só é marcado
    // como apagado onde havia um.
    await tx.feedback.updateMany({
      where: { id: { in: ids(true) } },
      data: {
        contatoNome: null,
        contatoEmail: null,
        contatoApagadoEm: agora,
        comentario: null,
        comentarioApagadoEm: agora,
      },
    });
    await tx.feedback.updateMany({
      where: { id: { in: ids(false) } },
      data: { contatoNome: null, contatoEmail: null, contatoApagadoEm: agora },
    });
    await tx.resposta.updateMany({
      where: { feedbackId: { in: feedbacks.map((f) => f.id) }, texto: { not: null } },
      data: { texto: null, textoApagadoEm: agora },
    });

    await registrarAuditoria(tx, {
      acao: "DADOS_DO_TITULAR_APAGADOS",
      usuarioId,
      entidade: "Retencao",
      entidadeId: "titular",
      detalhes: { feedbacks: feedbacks.length },
    });

    return { feedbacks: feedbacks.length };
  });
}
