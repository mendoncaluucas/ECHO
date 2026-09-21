import { describe, expect, it } from "vitest";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
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

// Duas áreas de mesmo nome no mesmo restaurante apareciam como barras
// indistinguíveis no dashboard. O banco passa a barrar.
describe("unicidade do nome da área", () => {
  it("recusa duas áreas com o mesmo nome no mesmo restaurante", async () => {
    const cenario = await criarCenarioCliente();

    const erro = await prisma.area
      .create({ data: { nome: cenario.area.nome, venueId: cenario.venue.id } })
      .then(() => null)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    // P2002 é o código que o errorHandler traduz para 409 CONFLITO.
    expect((erro as Prisma.PrismaClientKnownRequestError).code).toBe("P2002");
  });

  it("permite o mesmo nome em restaurantes diferentes", async () => {
    const cenario = await criarCenarioCliente();
    const outroVenue = await prisma.venue.create({ data: { nome: "Outro Restaurante" } });

    const area = await prisma.area.create({
      data: { nome: cenario.area.nome, venueId: outroVenue.id },
    });

    expect(area.nome).toBe(cenario.area.nome);
    expect(area.venueId).toBe(outroVenue.id);
  });
});
