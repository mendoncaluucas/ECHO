import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { criarCenarioCliente } from "./helpers.js";

describe("GET /api/areas", () => {
  it("lista as áreas com o restaurante ao qual pertencem", async () => {
    const cenario = await criarCenarioCliente();

    const res = await request(app).get("/api/areas");

    expect(res.status).toBe(200);
    expect(res.body.itens).toHaveLength(1);
    expect(res.body.itens[0]).toEqual({
      id: cenario.area.id,
      nome: "Mesa 1",
      venue: { nome: "Restaurante Teste" },
    });
  });

  it("devolve lista vazia quando não há áreas", async () => {
    const res = await request(app).get("/api/areas");

    expect(res.status).toBe(200);
    expect(res.body.itens).toEqual([]);
  });
});
