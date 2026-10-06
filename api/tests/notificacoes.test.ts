import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Papel, type TipoFeedback } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { autenticar, criarCenarioCliente, criarUsuario, QR_TOKEN } from "./helpers.js";

type Cenario = Awaited<ReturnType<typeof criarCenarioCliente>>;

function comToken(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// Passa pelo endpoint público de verdade: é ele que dispara as notificações.
async function enviarFeedback(cenario: Cenario, dados: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/public/feedback")
    .send({
      qrToken: QR_TOKEN,
      tipo: "SUGESTAO",
      avaliacoes: [{ categoriaId: cenario.categorias[0].id, estrelas: 4 }],
      ...dados,
    });
  expect(res.status).toBe(201);
  return res.body as { id: string };
}

describe("disparo das notificações", () => {
  let cenario: Cenario;

  beforeEach(async () => {
    cenario = await criarCenarioCliente();
  });

  // Regra de negócio: todo feedback novo notifica, sem filtro por tipo ou nota.
  it.each<TipoFeedback>(["ELOGIO", "SUGESTAO", "RECLAMACAO"])(
    "feedback do tipo %s notifica cada pessoa da gestão",
    async (tipo) => {
      const gerente = await criarUsuario(Papel.GERENTE);
      const coordenador = await criarUsuario(Papel.COORDENADOR);
      const admin = await criarUsuario(Papel.ADMINISTRADOR);

      const feedback = await enviarFeedback(cenario, { tipo });

      const notificacoes = await prisma.notification.findMany({ where: { feedbackId: feedback.id } });
      expect(notificacoes.map((n) => n.usuarioId).sort()).toEqual(
        [gerente.id, coordenador.id, admin.id].sort()
      );
      expect(notificacoes.every((n) => !n.lida)).toBe(true);
    }
  );

  it("quem está desativado não recebe", async () => {
    const ativo = await criarUsuario(Papel.GERENTE);
    const inativo = await criarUsuario(Papel.COORDENADOR);
    await prisma.user.update({ where: { id: inativo.id }, data: { ativo: false } });

    await enviarFeedback(cenario);

    expect(await prisma.notification.count({ where: { usuarioId: ativo.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { usuarioId: inativo.id } })).toBe(0);
  });

  it("feedback recusado não gera notificação", async () => {
    await criarUsuario(Papel.GERENTE);

    const res = await request(app)
      .post("/api/public/feedback")
      .send({ qrToken: "NAO-EXISTE", tipo: "ELOGIO", avaliacoes: [{ categoriaId: "x", estrelas: 5 }] });

    expect(res.status).toBe(404);
    expect(await prisma.notification.count()).toBe(0);
  });

  it("apagar o feedback leva as notificações junto", async () => {
    await criarUsuario(Papel.GERENTE);
    const feedback = await enviarFeedback(cenario);

    await prisma.feedback.delete({ where: { id: feedback.id } });

    expect(await prisma.notification.count()).toBe(0);
  });
});

describe("GET /api/notifications", () => {
  let cenario: Cenario;

  beforeEach(async () => {
    cenario = await criarCenarioCliente();
  });

  it("recusa acesso sem token", async () => {
    const res = await request(app).get("/api/notifications");
    expect(res.status).toBe(401);
  });

  it("traz o feedback de cada notificação, do mais recente ao mais antigo", async () => {
    const { token } = await autenticar(Papel.GERENTE);
    await enviarFeedback(cenario, { tipo: "ELOGIO", comentario: "primeiro" });
    await enviarFeedback(cenario, { tipo: "RECLAMACAO", comentario: "segundo" });

    const res = await request(app).get("/api/notifications").set(comToken(token));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 2, naoLidas: 2, pagina: 1, paginas: 1 });
    expect(res.body.itens[0]).toMatchObject({
      lida: false,
      feedback: {
        tipo: "RECLAMACAO",
        comentario: "segundo",
        status: "PENDENTE",
        area: { nome: "Mesa 1" },
        avaliacoes: [{ categoria: cenario.categorias[0].nome, estrelas: 4 }],
      },
    });
    expect(res.body.itens[1].feedback.comentario).toBe("primeiro");
  });

  // LGPD: o e-mail de quem se identificou não sai por aqui, como nas ocorrências.
  it("nunca expõe o e-mail de contato do cliente", async () => {
    const { token } = await autenticar(Papel.GERENTE);
    await enviarFeedback(cenario, { anonimo: false, contatoEmail: "cliente@exemplo.com" });

    const res = await request(app).get("/api/notifications").set(comToken(token));

    expect(JSON.stringify(res.body)).not.toContain("cliente@exemplo.com");
  });

  it("cada um vê só as próprias", async () => {
    const gerente = await autenticar(Papel.GERENTE);
    const coordenador = await autenticar(Papel.COORDENADOR);
    await enviarFeedback(cenario);
    // Uma a mais só para o gerente.
    const extra = await prisma.feedback.create({
      data: { venueId: cenario.venue.id, tipo: "ELOGIO" },
    });
    await prisma.notification.create({
      data: { usuarioId: gerente.usuario.id, feedbackId: extra.id },
    });

    const doGerente = await request(app).get("/api/notifications").set(comToken(gerente.token));
    const doCoordenador = await request(app)
      .get("/api/notifications")
      .set(comToken(coordenador.token));

    expect(doGerente.body.total).toBe(2);
    expect(doCoordenador.body.total).toBe(1);
  });

  it("filtra por lida e mantém a contagem de não lidas", async () => {
    const { usuario, token } = await autenticar(Papel.GERENTE);
    await enviarFeedback(cenario);
    await enviarFeedback(cenario);
    await prisma.notification.updateMany({
      where: { usuarioId: usuario.id },
      data: { lida: true },
    });
    await enviarFeedback(cenario);

    const naoLidas = await request(app).get("/api/notifications?lida=false").set(comToken(token));
    const lidas = await request(app).get("/api/notifications?lida=true").set(comToken(token));

    expect(naoLidas.body).toMatchObject({ total: 1, naoLidas: 1 });
    expect(lidas.body).toMatchObject({ total: 2, naoLidas: 1 });
  });

  it("recusa filtro e paginação malformados", async () => {
    const { token } = await autenticar(Papel.GERENTE);

    const lida = await request(app).get("/api/notifications?lida=talvez").set(comToken(token));
    const pagina = await request(app).get("/api/notifications?pagina=0").set(comToken(token));

    expect(lida.status).toBe(400);
    expect(pagina.status).toBe(400);
  });

  it("pagina sem repetir nem pular", async () => {
    const { token } = await autenticar(Papel.GERENTE);
    for (let i = 0; i < 5; i++) await enviarFeedback(cenario);

    const vistos: string[] = [];
    for (const pagina of [1, 2, 3]) {
      const res = await request(app)
        .get(`/api/notifications?porPagina=2&pagina=${pagina}`)
        .set(comToken(token));
      vistos.push(...res.body.itens.map((i: { id: string }) => i.id));
    }

    expect(new Set(vistos).size).toBe(5);
  });
});

describe("GET /api/notifications/contagem", () => {
  it("devolve só o número de não lidas de quem pergunta", async () => {
    const cenario = await criarCenarioCliente();
    const { token } = await autenticar(Papel.COORDENADOR);
    await enviarFeedback(cenario);
    await enviarFeedback(cenario);

    const res = await request(app).get("/api/notifications/contagem").set(comToken(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ naoLidas: 2 });
  });

  it("recusa acesso sem token", async () => {
    const res = await request(app).get("/api/notifications/contagem");
    expect(res.status).toBe(401);
  });
});

describe("marcar como lida", () => {
  let cenario: Cenario;

  beforeEach(async () => {
    cenario = await criarCenarioCliente();
  });

  it("marca e desmarca a própria notificação", async () => {
    const { usuario, token } = await autenticar(Papel.GERENTE);
    await enviarFeedback(cenario);
    const notificacao = await prisma.notification.findFirstOrThrow({
      where: { usuarioId: usuario.id },
    });

    const lida = await request(app)
      .patch(`/api/notifications/${notificacao.id}`)
      .set(comToken(token))
      .send({ lida: true });
    expect(lida.status).toBe(200);
    expect(lida.body).toMatchObject({ id: notificacao.id, lida: true });

    const desfeita = await request(app)
      .patch(`/api/notifications/${notificacao.id}`)
      .set(comToken(token))
      .send({ lida: false });
    expect(desfeita.body.lida).toBe(false);
  });

  // O coordenador ler o alerta não pode apagar o do gerente.
  it("marcar a própria não mexe na dos outros", async () => {
    const gerente = await autenticar(Papel.GERENTE);
    const coordenador = await autenticar(Papel.COORDENADOR);
    await enviarFeedback(cenario);
    const doCoordenador = await prisma.notification.findFirstOrThrow({
      where: { usuarioId: coordenador.usuario.id },
    });

    await request(app)
      .patch(`/api/notifications/${doCoordenador.id}`)
      .set(comToken(coordenador.token))
      .send({ lida: true })
      .expect(200);

    const doGerente = await prisma.notification.findFirstOrThrow({
      where: { usuarioId: gerente.usuario.id },
    });
    expect(doGerente.lida).toBe(false);
  });

  it("a notificação de outra pessoa responde 404 e não muda", async () => {
    const gerente = await autenticar(Papel.GERENTE);
    const coordenador = await autenticar(Papel.COORDENADOR);
    await enviarFeedback(cenario);
    const doGerente = await prisma.notification.findFirstOrThrow({
      where: { usuarioId: gerente.usuario.id },
    });

    const res = await request(app)
      .patch(`/api/notifications/${doGerente.id}`)
      .set(comToken(coordenador.token))
      .send({ lida: true });

    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe("NOTIFICACAO_NAO_ENCONTRADA");
    const depois = await prisma.notification.findUniqueOrThrow({ where: { id: doGerente.id } });
    expect(depois.lida).toBe(false);
  });

  it("recusa corpo sem booleano", async () => {
    const { token } = await autenticar(Papel.GERENTE);

    const res = await request(app)
      .patch("/api/notifications/qualquer")
      .set(comToken(token))
      .send({ lida: "sim" });

    expect(res.status).toBe(400);
  });

  it("marcar todas zera só as de quem pediu", async () => {
    const gerente = await autenticar(Papel.GERENTE);
    const coordenador = await autenticar(Papel.COORDENADOR);
    await enviarFeedback(cenario);
    await enviarFeedback(cenario);

    const res = await request(app)
      .post("/api/notifications/marcar-todas-lidas")
      .set(comToken(gerente.token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ atualizadas: 2 });
    expect(
      await prisma.notification.count({ where: { usuarioId: coordenador.usuario.id, lida: false } })
    ).toBe(2);
  });

  // Ler a notificação é rotina pessoal, não alteração no sistema.
  it("não entra no log de auditoria", async () => {
    const { token } = await autenticar(Papel.GERENTE);
    await enviarFeedback(cenario);

    await request(app).post("/api/notifications/marcar-todas-lidas").set(comToken(token));

    expect(await prisma.auditLog.count({ where: { acao: { not: "LOGIN" } } })).toBe(0);
  });
});
