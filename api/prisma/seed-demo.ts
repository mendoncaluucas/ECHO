// Dados de demonstração: feedbacks realistas espalhados pelos últimos ~85 dias,
// para a apresentação e para quem quiser ver o dashboard com conteúdo.
//
// ⚠️ APAGA TODOS OS FEEDBACKS antes de inserir. Por isso exige confirmação explícita:
//     ECHO_SEED_DEMO=confirmo npm run prisma:seed:demo
//
// Depende do seed principal (`npm run prisma:seed`), que cria restaurante, áreas,
// categorias e usuários. Este script só acrescenta os feedbacks.

import { Papel, StatusOcorrencia, TipoFeedback } from "@prisma/client";
import { prisma } from "../src/prisma.js";

const CONFIRMACAO = "confirmo";

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

// Feedbacks com até este tanto de dias chegam com a notificação ainda não lida.
const DIAS_NAO_LIDOS = 3;

const MESA = "Mesa 12";
const SALAO = "Salão";

type Demo = {
  diasAtras: number;
  tipo: TipoFeedback;
  area: string;
  status: StatusOcorrencia;
  /** Horas entre o envio e a ação da gestão. Só para quem não está PENDENTE. */
  horasAteTratar?: number;
  comentario: string;
  /** Mesmo formato do formulário: nome da categoria → estrelas. */
  notas: Record<string, number>;
};

// O conjunto conta uma história: a comida é o ponto forte, a higiene é o problema
// recorrente. Sem isso o dashboard fica bonito e inútil — o gerente precisa
// conseguir olhar e saber onde agir.
const FEEDBACKS: Demo[] = [
  // --- Últimos 7 dias: ainda chegando, a maioria sem tratativa ---
  { diasAtras: 1, tipo: "RECLAMACAO", area: MESA, status: "PENDENTE",
    comentario: "higiene: o banheiro estava sem papel e com o chão molhado",
    notas: { Higiene: 1, Atendimento: 4 } },
  { diasAtras: 2, tipo: "ELOGIO", area: SALAO, status: "PENDENTE",
    comentario: "alimento: o risoto estava excelente, melhor que da última vez",
    notas: { Alimento: 5, Higiene: 4 } },
  { diasAtras: 3, tipo: "SUGESTAO", area: MESA, status: "PENDENTE",
    comentario: "atendimento: poderiam ter opções sem glúten no cardápio",
    notas: { Atendimento: 4, Alimento: 4 } },
  { diasAtras: 4, tipo: "ELOGIO", area: SALAO, status: "EM_ANDAMENTO", horasAteTratar: 6,
    comentario: "atendimento: fomos muito bem atendidos | alimento: a comida saiu rápido",
    notas: { Atendimento: 5, Alimento: 5, Higiene: 4 } },
  { diasAtras: 5, tipo: "RECLAMACAO", area: MESA, status: "PENDENTE",
    comentario: "higiene: a mesa estava pegajosa quando sentamos",
    notas: { Higiene: 2, Atendimento: 3 } },
  { diasAtras: 6, tipo: "ELOGIO", area: MESA, status: "PENDENTE",
    comentario: "alimento: picanha no ponto certo",
    notas: { Alimento: 5, Atendimento: 4 } },

  // --- 7 a 14 dias: janela anterior, para a comparação de 7 dias fazer sentido ---
  { diasAtras: 8, tipo: "RECLAMACAO", area: SALAO, status: "RESOLVIDO", horasAteTratar: 20,
    comentario: "higiene: banheiro feminino sem sabonete",
    notas: { Higiene: 1, Atendimento: 3 } },
  { diasAtras: 9, tipo: "ELOGIO", area: SALAO, status: "RESOLVIDO", horasAteTratar: 30,
    comentario: "alimento: buffet variado e sempre bem reposto",
    notas: { Alimento: 5, Higiene: 4 } },
  { diasAtras: 10, tipo: "SUGESTAO", area: MESA, status: "EM_ANDAMENTO", horasAteTratar: 12,
    comentario: "atendimento: a fila do caixa no horário de pico é longa, um segundo caixa ajudaria",
    notas: { Atendimento: 3 } },
  { diasAtras: 11, tipo: "RECLAMACAO", area: MESA, status: "RESOLVIDO", horasAteTratar: 8,
    comentario: "atendimento: esperamos quase 40 minutos pelo prato",
    notas: { Atendimento: 2, Alimento: 4 } },
  { diasAtras: 12, tipo: "ELOGIO", area: SALAO, status: "RESOLVIDO", horasAteTratar: 26,
    comentario: "alimento: a sobremesa estava maravilhosa | atendimento: equipe muito simpática",
    notas: { Alimento: 5, Atendimento: 5, Higiene: 5 } },
  { diasAtras: 13, tipo: "RECLAMACAO", area: MESA, status: "RESOLVIDO", horasAteTratar: 14,
    comentario: "higiene: o talher veio manchado",
    notas: { Higiene: 2, Alimento: 4 } },

  // --- 14 a 30 dias ---
  { diasAtras: 16, tipo: "ELOGIO", area: SALAO, status: "RESOLVIDO", horasAteTratar: 18,
    comentario: "alimento: a feijoada de sábado estava impecável",
    notas: { Alimento: 5, Higiene: 4 } },
  { diasAtras: 18, tipo: "RECLAMACAO", area: MESA, status: "RESOLVIDO", horasAteTratar: 10,
    comentario: "higiene: o chão do salão estava escorregadio",
    notas: { Higiene: 2, Atendimento: 3 } },
  { diasAtras: 20, tipo: "SUGESTAO", area: SALAO, status: "RESOLVIDO", horasAteTratar: 22,
    comentario: "alimento: senti falta de uma opção vegetariana no buffet",
    notas: { Alimento: 3, Atendimento: 4 } },
  { diasAtras: 22, tipo: "ELOGIO", area: MESA, status: "RESOLVIDO", horasAteTratar: 16,
    comentario: "atendimento: atendimento atencioso mesmo com o restaurante cheio",
    notas: { Atendimento: 5, Higiene: 4 } },
  { diasAtras: 24, tipo: "RECLAMACAO", area: SALAO, status: "RESOLVIDO", horasAteTratar: 30,
    comentario: "higiene: banheiro masculino com mau cheiro forte",
    notas: { Higiene: 1 } },
  { diasAtras: 26, tipo: "ELOGIO", area: SALAO, status: "RESOLVIDO", horasAteTratar: 12,
    comentario: "alimento: carne macia e muito bem temperada",
    notas: { Alimento: 5, Higiene: 4 } },
  { diasAtras: 28, tipo: "SUGESTAO", area: MESA, status: "RESOLVIDO", horasAteTratar: 20,
    comentario: "atendimento: seria ótimo poder pagar pelo celular na mesa",
    notas: { Atendimento: 4, Alimento: 4 } },

  // --- 30 a 60 dias: janela anterior da comparação de 30 dias ---
  { diasAtras: 33, tipo: "RECLAMACAO", area: MESA, status: "RESOLVIDO", horasAteTratar: 24,
    comentario: "higiene: a mesa não tinha sido limpa antes de sentarmos",
    notas: { Higiene: 1, Atendimento: 3 } },
  { diasAtras: 36, tipo: "ELOGIO", area: SALAO, status: "RESOLVIDO", horasAteTratar: 14,
    comentario: "alimento: melhor almoço executivo da região",
    notas: { Alimento: 5, Atendimento: 4, Higiene: 4 } },
  { diasAtras: 40, tipo: "RECLAMACAO", area: SALAO, status: "RESOLVIDO", horasAteTratar: 36,
    comentario: "higiene: o copo veio com marca de batom",
    notas: { Higiene: 1, Alimento: 4 } },
  { diasAtras: 44, tipo: "ELOGIO", area: MESA, status: "RESOLVIDO", horasAteTratar: 10,
    comentario: "atendimento: o garçom lembrou do nosso pedido da semana passada",
    notas: { Atendimento: 5, Alimento: 5 } },
  { diasAtras: 48, tipo: "SUGESTAO", area: SALAO, status: "RESOLVIDO", horasAteTratar: 28,
    comentario: "alimento: poderiam servir um café depois da refeição",
    notas: { Alimento: 4, Atendimento: 4 } },
  { diasAtras: 52, tipo: "RECLAMACAO", area: MESA, status: "RESOLVIDO", horasAteTratar: 18,
    comentario: "higiene: o guardanapo do dispenser estava sujo",
    notas: { Higiene: 2, Alimento: 4 } },
  { diasAtras: 56, tipo: "ELOGIO", area: SALAO, status: "RESOLVIDO", horasAteTratar: 22,
    comentario: "alimento: a massa artesanal é muito boa",
    notas: { Alimento: 5, Higiene: 5 } },

  // --- 60 a 90 dias ---
  { diasAtras: 63, tipo: "ELOGIO", area: MESA, status: "RESOLVIDO", horasAteTratar: 16,
    comentario: "atendimento: a recepção foi muito simpática",
    notas: { Atendimento: 5, Alimento: 4 } },
  { diasAtras: 70, tipo: "RECLAMACAO", area: SALAO, status: "RESOLVIDO", horasAteTratar: 26,
    comentario: "higiene: bandeja do buffet com restos de comida",
    notas: { Higiene: 1, Alimento: 3 } },
  { diasAtras: 76, tipo: "SUGESTAO", area: MESA, status: "RESOLVIDO", horasAteTratar: 30,
    comentario: "atendimento: a música ambiente estava alta demais para conversar",
    notas: { Atendimento: 3, Alimento: 4 } },
  { diasAtras: 82, tipo: "ELOGIO", area: SALAO, status: "RESOLVIDO", horasAteTratar: 20,
    comentario: "alimento: porções generosas e bem servidas",
    notas: { Alimento: 5, Atendimento: 4, Higiene: 4 } },
];

async function main() {
  if (process.env.ECHO_SEED_DEMO !== CONFIRMACAO) {
    console.error(
      "Este script APAGA todos os feedbacks antes de inserir os de demonstração.\n" +
        `Para confirmar, rode com ECHO_SEED_DEMO=${CONFIRMACAO}.`
    );
    process.exit(1);
  }

  const venue = await prisma.venue.findFirst();
  if (!venue) {
    throw new Error("Nenhum restaurante cadastrado. Rode `npm run prisma:seed` antes.");
  }

  const areas = await prisma.area.findMany({ where: { venueId: venue.id } });
  const categorias = await prisma.category.findMany();
  const idDaArea = new Map(areas.map((a) => [a.nome, a.id]));
  const idDaCategoria = new Map(categorias.map((c) => [c.nome, c.id]));

  for (const nome of [MESA, SALAO]) {
    if (!idDaArea.has(nome)) throw new Error(`Área "${nome}" não existe. Rode o seed principal.`);
  }
  for (const nome of ["Higiene", "Atendimento", "Alimento"]) {
    if (!idDaCategoria.has(nome)) throw new Error(`Categoria "${nome}" não existe.`);
  }

  // Quem aparece como responsável pela tratativa.
  const coordenador = await prisma.user.findFirst({ where: { papel: Papel.COORDENADOR } });
  const gerente = await prisma.user.findFirst({ where: { papel: Papel.GERENTE } });

  // Mesma regra do POST /public/feedback: todo feedback notifica a gestão ativa.
  const destinatarios = await prisma.user.findMany({ where: { ativo: true }, select: { id: true } });

  // As notificações dos feedbacks apagados saem junto (cascade).
  const apagados = await prisma.feedback.deleteMany();
  console.log(`${apagados.count} feedback(s) anteriores apagados.`);

  const agora = Date.now();

  for (const [indice, item] of FEEDBACKS.entries()) {
    const criadoEm = new Date(agora - item.diasAtras * DIA);
    const tratado = item.status !== "PENDENTE";

    await prisma.feedback.create({
      data: {
        venueId: venue.id,
        areaId: idDaArea.get(item.area)!,
        tipo: item.tipo,
        comentario: item.comentario,
        anonimo: true,
        criadoEm,
        status: item.status,
        // Alterna entre os dois perfis da gestão para o "tratado por" não ficar monótono.
        tratadoPorId: tratado ? (indice % 3 === 0 ? gerente?.id : coordenador?.id) : null,
        tratadoEm: tratado
          ? new Date(criadoEm.getTime() + (item.horasAteTratar ?? 12) * HORA)
          : null,
        avaliacoes: {
          create: Object.entries(item.notas).map(([categoria, estrelas]) => ({
            categoryId: idDaCategoria.get(categoria)!,
            estrelas,
          })),
        },
        // Só os dos últimos dias chegam como não lidos: uma gestão em dia já teria
        // visto os antigos, e o sino com 30 pendências não pareceria real.
        notificacoes: {
          create: destinatarios.map((usuario) => ({
            usuarioId: usuario.id,
            criadoEm,
            lida: item.diasAtras > DIAS_NAO_LIDOS,
          })),
        },
      },
    });
  }

  console.log(`${FEEDBACKS.length} feedbacks de demonstração criados.`);
}

main()
  .catch((erro) => {
    console.error("Falha no seed de demonstração:", erro);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
