import { describe, expect, it } from "vitest";
import request from "supertest";
import { Papel } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { autenticar, criarCenarioCliente, QR_TOKEN } from "./helpers.js";

describe("GET /api/qrcodes", () => {
  it("lista os QR Codes com a área de cada um", async () => {
    const cenario = await criarCenarioCliente();
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .get("/api/qrcodes")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.itens).toHaveLength(1);
    expect(res.body.itens[0]).toMatchObject({
      token: QR_TOKEN,
      ativo: true,
      area: { nome: cenario.area.nome },
    });
  });

  it("traz os ativos primeiro", async () => {
    const cenario = await criarCenarioCliente();
    await prisma.qRCode.create({
      data: { token: "DESATIVADO", areaId: cenario.area.id, ativo: false },
    });
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .get("/api/qrcodes")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.itens.map((i: { token: string }) => i.token)).toEqual([
      QR_TOKEN,
      "DESATIVADO",
    ]);
  });

  // A listagem entrega todos os tokens de uma vez — com eles dá para enviar feedback
  // em nome de qualquer área sem passar por nenhuma mesa.
  it("recusa acesso sem token", async () => {
    await criarCenarioCliente();

    const res = await request(app).get("/api/qrcodes");

    expect(res.status).toBe(401);
  });

  it("libera para os papéis da gestão", async () => {
    await criarCenarioCliente();

    for (const papel of [Papel.GERENTE, Papel.COORDENADOR, Papel.ADMINISTRADOR]) {
      const { token } = await autenticar(papel);

      const res = await request(app)
        .get("/api/qrcodes")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
    }
  });

  it("devolve lista vazia quando não há QR Code", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .get("/api/qrcodes")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.itens).toEqual([]);
  });
});
