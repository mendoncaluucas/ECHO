import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Papel } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { autenticar, criarCenarioCliente } from "./helpers.js";

// Comparações "sem diferenciar maiúsculas" (mode: "insensitive" do Prisma) viram ILIKE
// no Postgres, e o Prisma não escapa os curingas: "_" valia por qualquer letra e "%" por
// qualquer texto. Ver semCuringas em src/consulta.ts.

const BARRA = "\\";

type Cenario = Awaited<ReturnType<typeof criarCenarioCliente>>;
let cenario: Cenario;
let token: string;

function comToken(t: string) {
  return { Authorization: `Bearer ${t}` };
}

beforeEach(async () => {
  cenario = await criarCenarioCliente(); // já cria a área "Mesa 1"
  token = (await autenticar(Papel.ADMINISTRADOR)).token;
});

describe("nome de área repetido", () => {
  it.each([
    ["Mesa_1", "o _ não vale por qualquer letra (havia \"Mesa 1\")"],
    ["%", "o % não vale por qualquer nome"],
    ["Mesa%", "nem no fim"],
  ])("aceita cadastrar %s: %s", async (nome) => {
    const res = await request(app).post("/api/areas").set(comToken(token)).send({ nome });
    expect(res.status).toBe(201);
  });

  it("continua recusando o mesmo nome com outras maiúsculas, inclusive com curinga", async () => {
    await request(app).post("/api/areas").set(comToken(token)).send({ nome: "Mesa_1" }).expect(201);
    const res = await request(app).post("/api/areas").set(comToken(token)).send({ nome: "MESA_1" });
    expect(res.status).toBe(409);
  });

  it("nome com barra invertida: igual é recusado, parecido não", async () => {
    await request(app).post("/api/areas").set(comToken(token)).send({ nome: `Bar${BARRA}Deck` }).expect(201);
    expect((await request(app).post("/api/areas").set(comToken(token)).send({ nome: `bar${BARRA}deck` })).status).toBe(409);
    expect((await request(app).post("/api/areas").set(comToken(token)).send({ nome: "BarDeck" })).status).toBe(201);
  });

  it("renomear para Mesa_1 não esbarra na Mesa 1", async () => {
    const varanda = await prisma.area.create({ data: { nome: "Varanda", venueId: cenario.venue.id } });
    const res = await request(app).patch(`/api/areas/${varanda.id}`).set(comToken(token)).send({ nome: "Mesa_1" });
    expect(res.status).toBe(200);
  });
});

describe("filtros das ocorrências", () => {
  async function feedback(comentario: string | null, categoriaIndex = 0, areaId = cenario.area.id) {
    return prisma.feedback.create({
      data: {
        venueId: cenario.venue.id,
        areaId,
        tipo: "RECLAMACAO",
        comentario,
        avaliacoes: { create: [{ categoryId: cenario.categorias[categoriaIndex].id, estrelas: 3 }] },
      },
    });
  }
  const buscar = async (query: string) => {
    const res = await request(app).get(`/api/occurrences?${query}`).set(comToken(token)).expect(200);
    return (res.body.itens as { comentario: string | null }[]).map((o) => o.comentario).sort();
  };

  it("busca: _ e % são texto, não curingas", async () => {
    await feedback("desconto de 10% na conta");
    await feedback("desconto de 10 reais");
    await feedback("mesa_vip suja");
    await feedback("mesaXvip suja");

    expect(await buscar(`busca=${encodeURIComponent("10%")}`)).toEqual(["desconto de 10% na conta"]);
    expect(await buscar(`busca=${encodeURIComponent("%")}`)).toEqual(["desconto de 10% na conta"]);
    expect(await buscar(`busca=${encodeURIComponent("mesa_vip")}`)).toEqual(["mesa_vip suja"]);
  });

  it("busca: barra invertida é texto (antes não achava nada)", async () => {
    await feedback(`caminho C:${BARRA}pasta errado`);
    await feedback("caminho C:pasta");

    expect(await buscar(`busca=${encodeURIComponent(`C:${BARRA}pasta`)}`)).toEqual([`caminho C:${BARRA}pasta errado`]);
  });

  it("busca: continua sem diferenciar maiúsculas, no comentário e no nome da área", async () => {
    const terraco = await prisma.area.create({ data: { nome: "Terraço_A", venueId: cenario.venue.id } });
    await feedback("O BANHEIRO estava sujo");
    await feedback(null, 0, terraco.id);
    await feedback("nada a ver");

    expect(await buscar("busca=banheiro")).toEqual(["O BANHEIRO estava sujo"]);
    expect(await buscar(`busca=${encodeURIComponent("terraço_a")}`)).toEqual([null]);
  });

  it("categoria: % não é todas, e o nome continua sem diferenciar maiúsculas", async () => {
    await feedback("da higiene", 0); // Higiene
    await feedback("do atendimento", 1); // Atendimento

    expect(await buscar(`categoria=${encodeURIComponent("%")}`)).toEqual([]);
    expect(await buscar(`categoria=${encodeURIComponent("H_giene")}`)).toEqual([]);
    expect(await buscar("categoria=higiene")).toEqual(["da higiene"]);
  });
});
