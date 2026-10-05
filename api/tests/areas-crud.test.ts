import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Papel } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { autenticar, criarCenarioCliente } from "./helpers.js";

type Cenario = Awaited<ReturnType<typeof criarCenarioCliente>>;

function comToken(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("POST /api/areas", () => {
  let cenario: Cenario;

  beforeEach(async () => {
    cenario = await criarCenarioCliente();
  });

  it("cadastra a área e ela já nasce ativa", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .post("/api/areas")
      .set(comToken(token))
      .send({ nome: "Varanda" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      nome: "Varanda",
      ativo: true,
      venue: { nome: cenario.venue.nome },
    });
  });

  // A constraint do banco é por texto exato: sem o trim, "Mesa 1" e "Mesa 1 "
  // conviveriam e o gerente veria duas áreas aparentemente iguais.
  it("remove espaços sobrando do nome", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .post("/api/areas")
      .set(comToken(token))
      .send({ nome: "   Deck   " });

    expect(res.body.nome).toBe("Deck");
  });

  it("recusa nome repetido no mesmo restaurante", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .post("/api/areas")
      .set(comToken(token))
      .send({ nome: cenario.area.nome });

    expect(res.status).toBe(409);
  });

  it("recusa nome vazio", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app).post("/api/areas").set(comToken(token)).send({ nome: "   " });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("VALIDACAO");
  });

  it("recusa quem não é administrador", async () => {
    const { token } = await autenticar(Papel.GERENTE);

    const res = await request(app).post("/api/areas").set(comToken(token)).send({ nome: "X" });

    expect(res.status).toBe(403);
  });

  it("recusa acesso sem token", async () => {
    const res = await request(app).post("/api/areas").send({ nome: "X" });

    expect(res.status).toBe(401);
  });

  // Com um restaurante só não faz sentido exigir venueId de quem está na tela.
  it("exige venueId quando há mais de um restaurante", async () => {
    await prisma.venue.create({ data: { nome: "Segundo Restaurante" } });
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .post("/api/areas")
      .set(comToken(token))
      .send({ nome: "Ambíguo" });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("VALIDACAO");
  });

  it("aceita venueId explícito quando informado", async () => {
    const outro = await prisma.venue.create({ data: { nome: "Filial" } });
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .post("/api/areas")
      .set(comToken(token))
      .send({ nome: "Mezanino", venueId: outro.id });

    expect(res.status).toBe(201);
    expect(res.body.venue.nome).toBe("Filial");
  });

  // "não achei o restaurante que você mandou" é diferente de "você não mandou e há
  // mais de um" — mensagens trocadas mandam quem integra procurar no lugar errado.
  it("responde 404 quando o venueId informado não existe", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .post("/api/areas")
      .set(comToken(token))
      .send({ nome: "Perdida", venueId: "00000000-0000-0000-0000-000000000000" });

    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe("VENUE_NAO_ENCONTRADO");
  });
});

// Desativar uma área precisa tirar de operação os QR Codes já impressos e colados
// nela. Sem isso a desativação só esconde a área da tela de geração, e o cliente
// sentado na mesa continua conseguindo enviar feedback.
describe("área desativada derruba os QR Codes dela", () => {
  it("o QR deixa de resolver o formulário", async () => {
    const cenario = await criarCenarioCliente();
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const antes = await request(app).get(`/api/public/venue/${cenario.qrCode.token}`);
    expect(antes.status).toBe(200);

    await request(app)
      .patch(`/api/areas/${cenario.area.id}`)
      .set(comToken(token))
      .send({ ativo: false });

    const depois = await request(app).get(`/api/public/venue/${cenario.qrCode.token}`);
    expect(depois.status).toBe(404);
    expect(depois.body.codigo).toBe("QR_NAO_ENCONTRADO");
  });

  it("o envio de feedback por aquele QR passa a ser recusado", async () => {
    const cenario = await criarCenarioCliente();
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    await request(app)
      .patch(`/api/areas/${cenario.area.id}`)
      .set(comToken(token))
      .send({ ativo: false });

    const res = await request(app)
      .post("/api/public/feedback")
      .send({
        qrToken: cenario.qrCode.token,
        tipo: "ELOGIO",
        anonimo: true,
        avaliacoes: [{ categoriaId: cenario.categorias[0].id, estrelas: 5 }],
      });

    expect(res.status).toBe(404);
    expect(await prisma.feedback.count()).toBe(0);
  });

  it("reativar a área faz o QR voltar a funcionar", async () => {
    const cenario = await criarCenarioCliente();
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    await request(app)
      .patch(`/api/areas/${cenario.area.id}`)
      .set(comToken(token))
      .send({ ativo: false });
    await request(app)
      .patch(`/api/areas/${cenario.area.id}`)
      .set(comToken(token))
      .send({ ativo: true });

    const res = await request(app).get(`/api/public/venue/${cenario.qrCode.token}`);

    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/areas/:id", () => {
  let cenario: Cenario;

  beforeEach(async () => {
    cenario = await criarCenarioCliente();
  });

  it("renomeia a área", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .patch(`/api/areas/${cenario.area.id}`)
      .set(comToken(token))
      .send({ nome: "Mesa 1 - Janela" });

    expect(res.status).toBe(200);
    expect(res.body.nome).toBe("Mesa 1 - Janela");
  });

  // Área com feedback não pode sumir, senão o histórico perde a referência.
  it("desativa sem apagar, preservando o feedback que aponta para ela", async () => {
    await prisma.feedback.create({
      data: {
        venueId: cenario.venue.id,
        areaId: cenario.area.id,
        tipo: "ELOGIO",
        anonimo: true,
      },
    });
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .patch(`/api/areas/${cenario.area.id}`)
      .set(comToken(token))
      .send({ ativo: false });

    expect(res.status).toBe(200);
    expect(res.body.ativo).toBe(false);

    const aindaExiste = await prisma.area.findUnique({ where: { id: cenario.area.id } });
    expect(aindaExiste).not.toBeNull();

    const ocorrencia = await prisma.feedback.findFirstOrThrow({
      include: { area: { select: { nome: true } } },
    });
    expect(ocorrencia.area?.nome).toBe(cenario.area.nome);
  });

  it("reativa a área", async () => {
    await prisma.area.update({ where: { id: cenario.area.id }, data: { ativo: false } });
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .patch(`/api/areas/${cenario.area.id}`)
      .set(comToken(token))
      .send({ ativo: true });

    expect(res.body.ativo).toBe(true);
  });

  it("recusa renomear para um nome já usado no restaurante", async () => {
    await prisma.area.create({ data: { nome: "Salão", venueId: cenario.venue.id } });
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .patch(`/api/areas/${cenario.area.id}`)
      .set(comToken(token))
      .send({ nome: "Salão" });

    expect(res.status).toBe(409);
  });

  it("responde 404 para id inexistente", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .patch("/api/areas/00000000-0000-0000-0000-000000000000")
      .set(comToken(token))
      .send({ nome: "X" });

    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe("AREA_NAO_ENCONTRADA");
  });

  it("recusa quem não é administrador", async () => {
    const { token } = await autenticar(Papel.COORDENADOR);

    const res = await request(app)
      .patch(`/api/areas/${cenario.area.id}`)
      .set(comToken(token))
      .send({ nome: "X" });

    expect(res.status).toBe(403);
  });
});

describe("GET /api/areas", () => {
  it("devolve ativas e inativas, com as ativas primeiro", async () => {
    const cenario = await criarCenarioCliente();
    await prisma.area.create({
      data: { nome: "Desativada", venueId: cenario.venue.id, ativo: false },
    });

    const res = await request(app).get("/api/areas");

    expect(res.status).toBe(200);
    expect(res.body.itens.map((a: { nome: string }) => a.nome)).toEqual([
      cenario.area.nome,
      "Desativada",
    ]);
    expect(res.body.itens[0].ativo).toBe(true);
    expect(res.body.itens[1].ativo).toBe(false);
  });
});
