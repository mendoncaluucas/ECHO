import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { QR_TOKEN, criarCenarioCliente } from "./helpers.js";

type Cenario = Awaited<ReturnType<typeof criarCenarioCliente>>;

describe("POST /api/public/feedback", () => {
  let cenario: Cenario;

  beforeEach(async () => {
    cenario = await criarCenarioCliente();
  });

  const corpoValido = (c: Cenario) => ({
    qrToken: QR_TOKEN,
    tipo: "RECLAMACAO",
    comentario: "Demora no atendimento.",
    anonimo: true,
    avaliacoes: [
      { categoriaId: c.categorias[0].id, estrelas: 2 },
      { categoriaId: c.categorias[1].id, estrelas: 4 },
    ],
  });

  it("grava o feedback e as notas por categoria", async () => {
    const res = await request(app)
      .post("/api/public/feedback")
      .send(corpoValido(cenario));

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.criadoEm).toBeTruthy();

    const gravado = await prisma.feedback.findUniqueOrThrow({
      where: { id: res.body.id },
      include: { avaliacoes: true },
    });

    expect(gravado.tipo).toBe("RECLAMACAO");
    expect(gravado.comentario).toBe("Demora no atendimento.");
    expect(gravado.areaId).toBe(cenario.area.id);
    expect(gravado.venueId).toBe(cenario.venue.id);
    expect(gravado.avaliacoes).toHaveLength(2);
    expect(gravado.avaliacoes.map((a) => a.estrelas).sort()).toEqual([2, 4]);
  });

  it("não guarda contatoEmail quando o feedback é anônimo", async () => {
    const res = await request(app)
      .post("/api/public/feedback")
      .send({ ...corpoValido(cenario), anonimo: true, contatoEmail: "cliente@exemplo.com" });

    expect(res.status).toBe(201);

    const gravado = await prisma.feedback.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(gravado.anonimo).toBe(true);
    expect(gravado.contatoEmail).toBeNull();
  });

  it("guarda o contatoEmail quando o cliente se identifica", async () => {
    const res = await request(app)
      .post("/api/public/feedback")
      .send({ ...corpoValido(cenario), anonimo: false, contatoEmail: "cliente@exemplo.com" });

    expect(res.status).toBe(201);

    const gravado = await prisma.feedback.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(gravado.contatoEmail).toBe("cliente@exemplo.com");
  });

  it("recusa tipo fora do enum", async () => {
    const res = await request(app)
      .post("/api/public/feedback")
      .send({ ...corpoValido(cenario), tipo: "XPTO" });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("VALIDACAO");
  });

  it("recusa estrelas fora do intervalo de 1 a 5", async () => {
    const res = await request(app)
      .post("/api/public/feedback")
      .send({
        ...corpoValido(cenario),
        avaliacoes: [{ categoriaId: cenario.categorias[0].id, estrelas: 9 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("VALIDACAO");
  });

  it("recusa envio sem nenhuma avaliação", async () => {
    const res = await request(app)
      .post("/api/public/feedback")
      .send({ ...corpoValido(cenario), avaliacoes: [] });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("VALIDACAO");
  });

  it("recusa a mesma categoria avaliada duas vezes", async () => {
    const id = cenario.categorias[0].id;
    const res = await request(app)
      .post("/api/public/feedback")
      .send({
        ...corpoValido(cenario),
        avaliacoes: [
          { categoriaId: id, estrelas: 3 },
          { categoriaId: id, estrelas: 5 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("VALIDACAO");
  });

  it("recusa comentário acima de 1000 caracteres", async () => {
    const res = await request(app)
      .post("/api/public/feedback")
      .send({ ...corpoValido(cenario), comentario: "x".repeat(1001) });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("VALIDACAO");
  });

  it("recusa categoria que não existe", async () => {
    const res = await request(app)
      .post("/api/public/feedback")
      .send({
        ...corpoValido(cenario),
        avaliacoes: [
          { categoriaId: "00000000-0000-0000-0000-000000000000", estrelas: 3 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("VALIDACAO");
  });

  it("responde 404 para qrToken inexistente", async () => {
    const res = await request(app)
      .post("/api/public/feedback")
      .send({ ...corpoValido(cenario), qrToken: "NAO-EXISTE" });

    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe("QR_NAO_ENCONTRADO");
  });

  it("não grava nada quando a validação falha", async () => {
    await request(app)
      .post("/api/public/feedback")
      .send({ ...corpoValido(cenario), tipo: "XPTO" });

    await expect(prisma.feedback.count()).resolves.toBe(0);
  });
});
