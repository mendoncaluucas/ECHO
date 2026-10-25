import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Papel, type User } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { aplicarRetencao, aplicarRetencaoSeDevido } from "../src/retencao.js";
import { autenticar, criarCenarioCliente } from "./helpers.js";

// Retenção de dados (LGPD). Ver src/retencao.ts e docs/PROXIMOS-PASSOS.md, seção 6.

const DIA = 24 * 60 * 60 * 1000;
// Um "agora" fixo: as fronteiras (89/90/91 dias) não podem depender de quando o teste roda.
const AGORA = new Date("2026-10-21T15:00:00-03:00");
const diasAntes = (dias: number, ms = 0) => new Date(AGORA.getTime() - dias * DIA - ms);

type Cenario = Awaited<ReturnType<typeof criarCenarioCliente>>;
let cenario: Cenario;

beforeEach(async () => {
  cenario = await criarCenarioCliente();
});

function comToken(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function criarFeedback({
  criadoEm,
  email = null as string | null,
  nome = null as string | null,
  comentario = null as string | null,
  estrelas = 4,
}: {
  criadoEm: Date;
  email?: string | null;
  nome?: string | null;
  comentario?: string | null;
  estrelas?: number;
}) {
  return prisma.feedback.create({
    data: {
      venueId: cenario.venue.id,
      areaId: cenario.area.id,
      tipo: "RECLAMACAO",
      criadoEm,
      comentario,
      anonimo: email === null,
      contatoNome: nome,
      contatoEmail: email,
      avaliacoes: { create: [{ categoryId: cenario.categorias[0].id, estrelas }] },
    },
  });
}

const ler = (id: string) => prisma.feedback.findUniqueOrThrow({ where: { id } });

describe("prazos", () => {
  it("contato: com 90 dias ainda fica; passou de 90 dias, sai", async () => {
    const com89 = await criarFeedback({ criadoEm: diasAntes(89), email: "a@x.com", nome: "Ana" });
    const com90 = await criarFeedback({ criadoEm: diasAntes(90), email: "b@x.com", nome: "Bia" });
    const passou = await criarFeedback({ criadoEm: diasAntes(90, 1), email: "c@x.com", nome: "Caio" });
    const com91 = await criarFeedback({ criadoEm: diasAntes(91), email: "d@x.com" });

    const resultado = await aplicarRetencao({ usuarioId: null, agora: AGORA });

    expect(resultado.contatos).toBe(2);
    expect(await ler(com89.id)).toMatchObject({ contatoEmail: "a@x.com", contatoNome: "Ana", contatoApagadoEm: null });
    expect(await ler(com90.id)).toMatchObject({ contatoEmail: "b@x.com", contatoApagadoEm: null });
    for (const { id } of [passou, com91]) {
      expect(await ler(id)).toMatchObject({ contatoEmail: null, contatoNome: null, contatoApagadoEm: AGORA });
    }
  });

  it("comentário: fica 12 meses, mesmo depois de o contato sair", async () => {
    const recente = await criarFeedback({ criadoEm: diasAntes(200), email: "a@x.com", comentario: "Mesa suja" });
    const antigo = await criarFeedback({ criadoEm: diasAntes(366), comentario: "Ligue 47 9999-0000" });

    const resultado = await aplicarRetencao({ usuarioId: null, agora: AGORA });

    expect(resultado.comentarios).toBe(1);
    expect(await ler(recente.id)).toMatchObject({
      comentario: "Mesa suja",
      comentarioApagadoEm: null,
      contatoEmail: null, // 200 dias: o contato (90) já saiu
    });
    expect(await ler(antigo.id)).toMatchObject({ comentario: null, comentarioApagadoEm: AGORA });
  });

  it("o feedback em si fica: tipo, notas, área, data e situação", async () => {
    const antigo = await criarFeedback({ criadoEm: diasAntes(400), email: "a@x.com", comentario: "x", estrelas: 2 });

    await aplicarRetencao({ usuarioId: null, agora: AGORA });

    const depois = await prisma.feedback.findUniqueOrThrow({
      where: { id: antigo.id },
      include: { avaliacoes: true },
    });
    expect(depois).toMatchObject({
      tipo: "RECLAMACAO",
      areaId: cenario.area.id,
      criadoEm: diasAntes(400),
      status: "PENDENTE",
      anonimo: false,
    });
    expect(depois.avaliacoes).toEqual([expect.objectContaining({ estrelas: 2 })]);
  });

  it("notificações: as de mais de 90 dias saem, as recentes ficam", async () => {
    const gerente = await prisma.user.create({
      data: { nome: "G", email: "g@x.com", senhaHash: "x", papel: Papel.GERENTE },
    });
    const velho = await criarFeedback({ criadoEm: diasAntes(100) });
    const novo = await criarFeedback({ criadoEm: diasAntes(10) });
    await prisma.notification.create({ data: { usuarioId: gerente.id, feedbackId: velho.id, criadoEm: diasAntes(100) } });
    await prisma.notification.create({ data: { usuarioId: gerente.id, feedbackId: novo.id, criadoEm: diasAntes(10) } });

    const resultado = await aplicarRetencao({ usuarioId: null, agora: AGORA });

    expect(resultado.notificacoes).toBe(1);
    expect(await prisma.notification.findMany({ select: { feedbackId: true } })).toEqual([{ feedbackId: novo.id }]);
  });

  it("os prazos configurados pelo administrador valem", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    await request(app).patch("/api/configuracoes").set(comToken(token)).send({ retencaoContatoDias: 30 }).expect(200);
    const com45 = await criarFeedback({ criadoEm: diasAntes(45), email: "a@x.com" });

    await aplicarRetencao({ usuarioId: null, agora: AGORA });

    expect((await ler(com45.id)).contatoEmail).toBeNull();
  });

  it("rodar de novo não muda nada: nem as contagens, nem a data de quando saiu", async () => {
    const antigo = await criarFeedback({ criadoEm: diasAntes(400), email: "a@x.com", comentario: "x" });
    await aplicarRetencao({ usuarioId: null, agora: AGORA });

    const segunda = await aplicarRetencao({ usuarioId: null, agora: new Date(AGORA.getTime() + DIA) });

    expect(segunda).toEqual({ contatos: 0, comentarios: 0, notificacoes: 0, respostas: 0 });
    expect(await ler(antigo.id)).toMatchObject({ contatoApagadoEm: AGORA, comentarioApagadoEm: AGORA });
  });
});

describe("os números dos painéis não mudam ao anonimizar", () => {
  it("métricas, relatório e lista de ocorrências iguais antes e depois", async () => {
    const { token } = await autenticar(Papel.GERENTE);
    const agora = new Date();
    for (const dias of [5, 40, 100, 200, 300]) {
      await criarFeedback({
        criadoEm: new Date(agora.getTime() - dias * DIA),
        email: `cliente${dias}@x.com`,
        comentario: `comentário de ${dias} dias`,
        estrelas: (dias % 5) + 1,
      });
    }
    // O período ("de"/"ate") é o instante do cálculo: muda entre uma chamada e outra.
    const semPeriodo = ({ periodo: _, ...resto }: Record<string, unknown>) => resto;
    const paineis = async () => ({
      metricas: semPeriodo((await request(app).get("/api/metrics?dias=365").set(comToken(token))).body),
      relatorio: (await request(app).get("/api/metrics/relatorio?de=2025-01-01").set(comToken(token))).body,
      total: (await request(app).get("/api/occurrences?status=PENDENTE").set(comToken(token))).body.total,
    });

    const antes = await paineis();
    // Prazos curtos para anonimizar quase tudo.
    await prisma.configuracao.create({
      data: { id: "sistema", retencaoContatoDias: 30, retencaoComentarioDias: 30 },
    });
    const resultado = await aplicarRetencao({ usuarioId: null });
    const depois = await paineis();

    expect(resultado).toMatchObject({ contatos: 4, comentarios: 4 });
    expect(antes.total).toBe(5);
    expect(depois).toEqual(antes);
  });
});

describe("log", () => {
  it("a rodada automática registra como sistema, só as contagens e os prazos da vez", async () => {
    await criarFeedback({ criadoEm: diasAntes(100), email: "segredo@x.com", nome: "Fulano", comentario: "não pode ir pro log" });
    await criarFeedback({ criadoEm: diasAntes(400), comentario: "nem este" });

    await aplicarRetencao({ usuarioId: null, agora: AGORA });

    const registro = await prisma.auditLog.findFirstOrThrow({ where: { acao: "RETENCAO_APLICADA" } });
    expect(registro).toMatchObject({
      usuarioId: null,
      entidade: "Configuracao",
      detalhes: {
        contatos: 1, // o de 400 dias não tinha contato
        comentarios: 1,
        notificacoes: 0,
        prazos: { contatoDias: 90, comentarioDias: 365, notificacaoDias: 90 },
      },
    });
    const texto = JSON.stringify(registro);
    for (const pessoal of ["segredo@x.com", "Fulano", "não pode ir pro log", "nem este"]) {
      expect(texto).not.toContain(pessoal);
    }
  });

  it("rodada automática sem nada a fazer não enche o log", async () => {
    await criarFeedback({ criadoEm: diasAntes(10), email: "a@x.com" });
    await aplicarRetencao({ usuarioId: null, agora: AGORA });
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("quem aplica pela tela fica registrado mesmo sem nada a fazer", async () => {
    const { usuario, token } = await autenticar(Papel.ADMINISTRADOR);
    await request(app).post("/api/retencao/aplicar").set(comToken(token)).expect(200);
    const registro = await prisma.auditLog.findFirstOrThrow({ where: { acao: "RETENCAO_APLICADA" } });
    expect(registro).toMatchObject({ usuarioId: usuario.id, detalhes: { contatos: 0, comentarios: 0, notificacoes: 0 } });
  });

  it("no log de atividades, o sistema aparece sem usuário e tem filtro próprio", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR); // o login também vai para o log
    await criarFeedback({ criadoEm: diasAntes(100), email: "a@x.com" });
    await aplicarRetencao({ usuarioId: null, agora: AGORA });

    const tudo = await request(app).get("/api/audit").set(comToken(token)).expect(200);
    const doSistema = await request(app).get("/api/audit?usuarioId=sistema").set(comToken(token)).expect(200);

    expect(tudo.body.total).toBe(2);
    expect(doSistema.body.itens).toEqual([
      expect.objectContaining({ acao: "RETENCAO_APLICADA", usuario: null }),
    ]);
  });
});

describe("rodada automática (ao ligar e de hora em hora)", () => {
  it("roda no máximo uma vez por dia", async () => {
    await criarFeedback({ criadoEm: diasAntes(100), email: "a@x.com" });

    expect(await aplicarRetencaoSeDevido(AGORA)).toMatchObject({ contatos: 1 });
    expect(await aplicarRetencaoSeDevido(new Date(AGORA.getTime() + 23 * 60 * 60 * 1000))).toBeNull();
    expect(await aplicarRetencaoSeDevido(new Date(AGORA.getTime() + DIA))).toEqual({
      contatos: 0,
      comentarios: 0,
      notificacoes: 0,
      respostas: 0,
    });
  });

  it("duas chamadas ao mesmo tempo: só uma aplica", async () => {
    await criarFeedback({ criadoEm: diasAntes(100), email: "a@x.com" });

    const resultados = await Promise.all([
      aplicarRetencaoSeDevido(AGORA),
      aplicarRetencaoSeDevido(AGORA),
      aplicarRetencaoSeDevido(AGORA),
    ]);

    expect(resultados.filter((r) => r !== null)).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { acao: "RETENCAO_APLICADA" } })).toBe(1);
  });

  it("se falhar, devolve a data anterior para tentar de novo na próxima hora", async () => {
    await criarFeedback({ criadoEm: diasAntes(100), email: "a@x.com" });
    const ontem = new Date(AGORA.getTime() - DIA - 1);
    await prisma.configuracao.create({ data: { id: "sistema", ultimaRetencaoEm: ontem } });
    vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("banco caiu"));

    await expect(aplicarRetencaoSeDevido(AGORA)).rejects.toThrow("banco caiu");

    const configuracao = await prisma.configuracao.findUniqueOrThrow({ where: { id: "sistema" } });
    expect(configuracao.ultimaRetencaoEm).toEqual(ontem);
    vi.restoreAllMocks();
    expect(await aplicarRetencaoSeDevido(new Date(AGORA.getTime() + 60 * 60 * 1000))).toMatchObject({ contatos: 1 });
  });
});

describe("rotas da retenção (administrador)", () => {
  let admin: { usuario: User; token: string };
  beforeEach(async () => {
    admin = await autenticar(Papel.ADMINISTRADOR);
  });

  it("prévia: diz quanto sairia, sem mudar nada", async () => {
    const antigo = await criarFeedback({ criadoEm: new Date(Date.now() - 100 * DIA), email: "a@x.com", comentario: "x" });

    const res = await request(app).get("/api/retencao/previa").set(comToken(admin.token)).expect(200);

    expect(res.body).toEqual({ contatos: 1, comentarios: 0, notificacoes: 0, respostas: 0, ultimaRetencaoEm: null });
    expect((await ler(antigo.id)).contatoEmail).toBe("a@x.com");
    expect(await prisma.auditLog.count({ where: { acao: "RETENCAO_APLICADA" } })).toBe(0);
  });

  it("aplicar: anonimiza agora e devolve as contagens", async () => {
    const antigo = await criarFeedback({ criadoEm: new Date(Date.now() - 100 * DIA), email: "a@x.com" });

    const res = await request(app).post("/api/retencao/aplicar").set(comToken(admin.token)).expect(200);

    expect(res.body).toEqual({ contatos: 1, comentarios: 0, notificacoes: 0, respostas: 0 });
    expect((await ler(antigo.id)).contatoEmail).toBeNull();
    const previa = await request(app).get("/api/retencao/previa").set(comToken(admin.token));
    expect(previa.body.ultimaRetencaoEm).not.toBeNull();
  });

  it.each([Papel.GERENTE, Papel.COORDENADOR])("%s não acessa nenhuma das três", async (papel) => {
    const { token } = await autenticar(papel, `${papel}@outro.com`);
    await request(app).get("/api/retencao/previa").set(comToken(token)).expect(403);
    await request(app).post("/api/retencao/aplicar").set(comToken(token)).expect(403);
    await request(app).post("/api/retencao/titular").set(comToken(token)).send({ email: "a@x.com" }).expect(403);
  });

  it("sem token, 401", async () => {
    await request(app).get("/api/retencao/previa").expect(401);
  });
});

describe("pedido do cliente para apagar os dados (LGPD, art. 18)", () => {
  let token: string;
  let adminId: string;
  beforeEach(async () => {
    const admin = await autenticar(Papel.ADMINISTRADOR);
    token = admin.token;
    adminId = admin.usuario.id;
  });

  it("apaga na hora contato e comentário de todos os feedbacks daquele e-mail, sem diferenciar maiúsculas", async () => {
    const recente = await criarFeedback({ criadoEm: new Date(), email: "Ana@Exemplo.com", nome: "Ana", comentario: "Sou a Ana" });
    const antigo = await criarFeedback({ criadoEm: diasAntes(30), email: "ana@exemplo.com", nome: "Ana" });
    const outro = await criarFeedback({ criadoEm: new Date(), email: "bia@exemplo.com", nome: "Bia", comentario: "Sou a Bia" });

    const res = await request(app)
      .post("/api/retencao/titular")
      .set(comToken(token))
      .send({ email: "  ANA@exemplo.com " })
      .expect(200);

    expect(res.body).toEqual({ feedbacks: 2 });
    expect(await ler(recente.id)).toMatchObject({ contatoEmail: null, contatoNome: null, comentario: null });
    expect((await ler(recente.id)).comentarioApagadoEm).not.toBeNull();
    // Sem comentário, nada a marcar como apagado.
    expect(await ler(antigo.id)).toMatchObject({ contatoEmail: null, comentarioApagadoEm: null });
    expect(await ler(outro.id)).toMatchObject({ contatoEmail: "bia@exemplo.com", comentario: "Sou a Bia" });
  });

  // O mode "insensitive" do Prisma vira ILIKE: "_" e "%" eram curingas, e "%@%" apagava
  // o contato de todo mundo.
  it.each([
    ["a_b@x.com", "um _ não vale por qualquer letra"],
    ["%@%", "um % não vale por qualquer texto"],
    ["ana@x.co", "parte do e-mail não basta"],
  ])("%s não atinge outros clientes (%s)", async (pedido) => {
    const outros = ["aXb@x.com", "ana@x.com", "bia@y.com"];
    for (const email of outros) await criarFeedback({ criadoEm: new Date(), email });

    const res = await request(app).post("/api/retencao/titular").set(comToken(token)).send({ email: pedido });

    expect(res.body).toEqual({ feedbacks: 0 });
    const restantes = await prisma.feedback.findMany({ where: { contatoEmail: { not: null } } });
    expect(restantes.map((f) => f.contatoEmail).sort()).toEqual([...outros].sort());
  });

  it("o log guarda quem pediu e quantos; o e-mail não fica em lugar nenhum", async () => {
    await criarFeedback({ criadoEm: new Date(), email: "ana@exemplo.com" });

    await request(app).post("/api/retencao/titular").set(comToken(token)).send({ email: "ana@exemplo.com" }).expect(200);

    const registro = await prisma.auditLog.findFirstOrThrow({ where: { acao: "DADOS_DO_TITULAR_APAGADOS" } });
    expect(registro).toMatchObject({ usuarioId: adminId, entidade: "Retencao", detalhes: { feedbacks: 1 } });
    expect(JSON.stringify(registro)).not.toContain("ana@exemplo.com");
  });

  it("e-mail sem nenhum feedback: responde 0 (e registra o pedido)", async () => {
    const res = await request(app).post("/api/retencao/titular").set(comToken(token)).send({ email: "ninguem@x.com" });
    expect(res.body).toEqual({ feedbacks: 0 });
  });

  it.each([undefined, "", "sem-arroba", "com espaco@x.com", 42])("recusa e-mail inválido (%s)", async (email) => {
    const res = await request(app).post("/api/retencao/titular").set(comToken(token)).send({ email });
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("VALIDACAO");
  });
});

describe("a ocorrência depois de anonimizada", () => {
  it("o detalhe diz quando o contato e o comentário saíram", async () => {
    const { token } = await autenticar(Papel.COORDENADOR);
    const antigo = await criarFeedback({ criadoEm: diasAntes(400), email: "a@x.com", nome: "Ana", comentario: "x" });
    await aplicarRetencao({ usuarioId: null, agora: AGORA });

    const res = await request(app).get(`/api/occurrences/${antigo.id}`).set(comToken(token)).expect(200);

    expect(res.body).toMatchObject({
      contato: null,
      comentario: null,
      contatoApagadoEm: AGORA.toISOString(),
      comentarioApagadoEm: AGORA.toISOString(),
    });
  });
});

describe("configurações de retenção", () => {
  it("salvar só um prazo mantém os outros, e cada mudança vai para o log", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .patch("/api/configuracoes")
      .set(comToken(token))
      .send({ retencaoContatoDias: 60, retencaoComentarioDias: 365 })
      .expect(200);

    expect(res.body).toMatchObject({
      duracaoSessaoHoras: 8,
      retencaoContatoDias: 60,
      retencaoComentarioDias: 365,
      retencaoNotificacaoDias: 90,
    });
    // Só o que mudou: o comentário foi enviado com o mesmo valor.
    const registros = await prisma.auditLog.findMany({ where: { acao: "CONFIGURACAO_ALTERADA" } });
    expect(registros.map((r) => r.detalhes)).toEqual([{ campo: "retencaoContatoDias", de: 90, para: 60 }]);
  });

  it.each([
    ["retencaoContatoDias", 29],
    ["retencaoContatoDias", 366],
    ["retencaoComentarioDias", 29],
    ["retencaoComentarioDias", 1826],
    ["retencaoNotificacaoDias", 6],
    ["retencaoNotificacaoDias", 366],
    ["retencaoContatoDias", 45.5],
    ["retencaoContatoDias", "60"],
  ])("recusa %s = %s, sem salvar nada", async (campo, valor) => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    const res = await request(app)
      .patch("/api/configuracoes")
      .set(comToken(token))
      .send({ duracaoSessaoHoras: 4, [campo]: valor });
    expect(res.status).toBe(400);
    expect(await prisma.configuracao.count()).toBe(0);
  });

  it("sem nenhum campo conhecido, 400", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    const res = await request(app).patch("/api/configuracoes").set(comToken(token)).send({ outro: 1 });
    expect(res.status).toBe(400);
  });

  it("os prazos são públicos (para o formulário e a página de privacidade) e seguem o configurado", async () => {
    const semConfiguracao = await request(app).get("/api/public/privacidade").expect(200);
    expect(semConfiguracao.body).toEqual({ contatoDias: 90, comentarioDias: 365 });

    const { token } = await autenticar(Papel.ADMINISTRADOR);
    await request(app).patch("/api/configuracoes").set(comToken(token)).send({ retencaoContatoDias: 60 }).expect(200);

    const depois = await request(app).get("/api/public/privacidade").expect(200);
    expect(depois.body).toEqual({ contatoDias: 60, comentarioDias: 365 });
  });
});
