import { describe, expect, it } from "vitest";
import request from "supertest";
import { Papel } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { QR_TOKEN, autenticar, criarCenarioCliente } from "./helpers.js";

// Cria um feedback direto no banco, sem passar pela API, para isolar o que está sob teste.
async function gravarFeedback(
  cenario: Awaited<ReturnType<typeof criarCenarioCliente>>,
  dados: { comentario: string; criadoEm?: Date; contatoEmail?: string }
) {
  return prisma.feedback.create({
    data: {
      venueId: cenario.venue.id,
      areaId: cenario.area.id,
      tipo: "RECLAMACAO",
      comentario: dados.comentario,
      anonimo: dados.contatoEmail ? false : true,
      contatoEmail: dados.contatoEmail ?? null,
      ...(dados.criadoEm ? { criadoEm: dados.criadoEm } : {}),
      avaliacoes: {
        create: [{ categoryId: cenario.categorias[0].id, estrelas: 3 }],
      },
    },
  });
}

describe("GET /api/occurrences", () => {
  it("recusa acesso sem token", async () => {
    const res = await request(app).get("/api/occurrences");

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe("NAO_AUTENTICADO");
  });

  it("recusa token adulterado", async () => {
    const res = await request(app)
      .get("/api/occurrences")
      .set("Authorization", "Bearer abc.def.ghi");

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe("TOKEN_INVALIDO");
  });

  it("recusa header fora do formato Bearer", async () => {
    const { token } = await autenticar(Papel.GERENTE);

    const res = await request(app).get("/api/occurrences").set("Authorization", token);

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe("NAO_AUTENTICADO");
  });

  it("lista os feedbacks para um usuário autenticado", async () => {
    const cenario = await criarCenarioCliente();
    await gravarFeedback(cenario, { comentario: "Primeiro" });
    const { token } = await autenticar(Papel.GERENTE);

    const res = await request(app)
      .get("/api/occurrences")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.itens).toHaveLength(1);
    expect(res.body.itens[0]).toMatchObject({
      tipo: "RECLAMACAO",
      comentario: "Primeiro",
      anonimo: true,
      area: { nome: "Mesa 1" },
    });
    expect(res.body.itens[0].avaliacoes).toEqual([{ categoria: "Higiene", estrelas: 3 }]);
  });

  it("ordena do mais recente para o mais antigo", async () => {
    const cenario = await criarCenarioCliente();
    await gravarFeedback(cenario, {
      comentario: "Mais antigo",
      criadoEm: new Date("2026-01-01T10:00:00Z"),
    });
    await gravarFeedback(cenario, {
      comentario: "Mais recente",
      criadoEm: new Date("2026-06-01T10:00:00Z"),
    });
    const { token } = await autenticar(Papel.GERENTE);

    const res = await request(app)
      .get("/api/occurrences")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.itens.map((i: { comentario: string }) => i.comentario)).toEqual([
      "Mais recente",
      "Mais antigo",
    ]);
  });

  // LGPD: o e-mail de contato é dado pessoal e não faz parte do contrato desta rota.
  it("não expõe o contatoEmail de quem se identificou", async () => {
    const cenario = await criarCenarioCliente();
    await gravarFeedback(cenario, {
      comentario: "Identificado",
      contatoEmail: "cliente@exemplo.com",
    });
    const { token } = await autenticar(Papel.GERENTE);

    const res = await request(app)
      .get("/api/occurrences")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("cliente@exemplo.com");
    expect(res.body.itens[0].contatoEmail).toBeUndefined();
  });

  it.each([Papel.COORDENADOR, Papel.GERENTE, Papel.ADMINISTRADOR])(
    "permite acesso ao papel %s",
    async (papel) => {
      const { token } = await autenticar(papel);

      const res = await request(app)
        .get("/api/occurrences")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
    }
  );
});
