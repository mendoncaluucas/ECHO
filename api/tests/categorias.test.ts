import { describe, expect, it } from "vitest";
import request from "supertest";
import { Papel } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { autenticar, criarCenarioCliente } from "./helpers.js";

describe("GET /api/categorias", () => {
  it.each([Papel.COORDENADOR, Papel.GERENTE, Papel.ADMINISTRADOR])(
    "lista em ordem alfabética para %s",
    async (papel) => {
      await criarCenarioCliente();
      const { token } = await autenticar(papel);

      const res = await request(app).get("/api/categorias").set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.itens.map((c: { nome: string }) => c.nome)).toEqual([
        "Alimento",
        "Atendimento",
        "Higiene",
      ]);
      expect(res.body.itens[0]).toEqual({ id: expect.any(String), nome: "Alimento" });
    }
  );

  // Categoria cadastrada direto no banco aparece no filtro sem mexer no front.
  it("traz categoria nova", async () => {
    await criarCenarioCliente();
    await prisma.category.create({ data: { nome: "Ambiente" } });
    const { token } = await autenticar(Papel.COORDENADOR);

    const res = await request(app).get("/api/categorias").set("Authorization", `Bearer ${token}`);

    expect(res.body.itens.map((c: { nome: string }) => c.nome)).toContain("Ambiente");
  });

  it("exige login", async () => {
    const res = await request(app).get("/api/categorias");
    expect(res.status).toBe(401);
  });
});
