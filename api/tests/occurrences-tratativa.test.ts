import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Papel } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { autenticar, criarCenarioCliente } from "./helpers.js";

type Cenario = Awaited<ReturnType<typeof criarCenarioCliente>>;

async function gravarFeedback(cenario: Cenario) {
  return prisma.feedback.create({
    data: {
      venueId: cenario.venue.id,
      areaId: cenario.area.id,
      tipo: "RECLAMACAO",
      comentario: "Demora no atendimento.",
      anonimo: true,
      avaliacoes: { create: [{ categoryId: cenario.categorias[0].id, estrelas: 2 }] },
    },
  });
}

describe("tratativa de ocorrências", () => {
  let cenario: Cenario;

  beforeEach(async () => {
    cenario = await criarCenarioCliente();
  });

  it("feedback novo nasce com status PENDENTE", async () => {
    const feedback = await gravarFeedback(cenario);

    expect(feedback.status).toBe("PENDENTE");
    expect(feedback.tratadoPorId).toBeNull();
    expect(feedback.tratadoEm).toBeNull();
  });

  describe("GET /api/occurrences/:id", () => {
    it("devolve o detalhe da ocorrência", async () => {
      const feedback = await gravarFeedback(cenario);
      const { token } = await autenticar(Papel.COORDENADOR);

      const res = await request(app)
        .get(`/api/occurrences/${feedback.id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: feedback.id,
        tipo: "RECLAMACAO",
        comentario: "Demora no atendimento.",
        status: "PENDENTE",
        area: { nome: "Mesa 1" },
      });
      expect(res.body.avaliacoes).toEqual([{ categoria: "Higiene", estrelas: 2 }]);
    });

    it("recusa acesso sem token", async () => {
      const feedback = await gravarFeedback(cenario);

      const res = await request(app).get(`/api/occurrences/${feedback.id}`);

      expect(res.status).toBe(401);
    });

    it("responde 404 para id inexistente", async () => {
      const { token } = await autenticar(Papel.COORDENADOR);

      const res = await request(app)
        .get("/api/occurrences/00000000-0000-0000-0000-000000000000")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.codigo).toBe("OCORRENCIA_NAO_ENCONTRADA");
    });
  });

  describe("PATCH /api/occurrences/:id", () => {
    it("muda o status e registra quem tratou", async () => {
      const feedback = await gravarFeedback(cenario);
      const { token, usuario } = await autenticar(Papel.COORDENADOR);

      const res = await request(app)
        .patch(`/api/occurrences/${feedback.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "RESOLVIDO" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("RESOLVIDO");
      expect(res.body.tratadoPor).toEqual({ nome: usuario.nome });

      const gravada = await prisma.feedback.findUniqueOrThrow({
        where: { id: feedback.id },
      });
      expect(gravada.status).toBe("RESOLVIDO");
      expect(gravada.tratadoPorId).toBe(usuario.id);
      expect(gravada.tratadoEm).not.toBeNull();
    });

    it("recusa status fora do enum", async () => {
      const feedback = await gravarFeedback(cenario);
      const { token } = await autenticar(Papel.COORDENADOR);

      const res = await request(app)
        .patch(`/api/occurrences/${feedback.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "ARQUIVADO" });

      expect(res.status).toBe(400);
      expect(res.body.codigo).toBe("VALIDACAO");
    });

    it("recusa acesso sem token", async () => {
      const feedback = await gravarFeedback(cenario);

      const res = await request(app)
        .patch(`/api/occurrences/${feedback.id}`)
        .send({ status: "RESOLVIDO" });

      expect(res.status).toBe(401);
    });

    it("responde 404 para id inexistente", async () => {
      const { token } = await autenticar(Papel.COORDENADOR);

      const res = await request(app)
        .patch("/api/occurrences/00000000-0000-0000-0000-000000000000")
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "RESOLVIDO" });

      expect(res.status).toBe(404);
    });

    // Quem tratou sai do token: o corpo da requisição não pode forjar outro usuário.
    it("ignora tratadoPorId enviado no corpo", async () => {
      const feedback = await gravarFeedback(cenario);
      const outro = await prisma.user.create({
        data: {
          nome: "Outro",
          email: "outro@teste.com",
          senhaHash: "x",
          papel: Papel.GERENTE,
        },
      });
      const { token, usuario } = await autenticar(Papel.COORDENADOR);

      await request(app)
        .patch(`/api/occurrences/${feedback.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "EM_ANDAMENTO", tratadoPorId: outro.id });

      const gravada = await prisma.feedback.findUniqueOrThrow({
        where: { id: feedback.id },
      });
      expect(gravada.tratadoPorId).toBe(usuario.id);
    });
  });

  it("a listagem passa a devolver o status", async () => {
    await gravarFeedback(cenario);
    const { token } = await autenticar(Papel.COORDENADOR);

    const res = await request(app)
      .get("/api/occurrences")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.itens[0].status).toBe("PENDENTE");
  });
});
