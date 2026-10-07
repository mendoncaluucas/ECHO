import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Papel } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { autenticar, criarCenarioCliente, QR_TOKEN } from "./helpers.js";

type Cenario = Awaited<ReturnType<typeof criarCenarioCliente>>;

function comToken(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("GET /api/qrcodes — dados para a tela de QR Codes", () => {
  it("traz o id da área e o link pronto de cada código", async () => {
    const cenario = await criarCenarioCliente();
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app).get("/api/qrcodes").set(comToken(token));

    expect(res.body.itens[0]).toMatchObject({
      token: QR_TOKEN,
      area: { id: cenario.area.id, nome: "Mesa 1" },
      url: expect.stringMatching(new RegExp(`/feedback\\?t=${QR_TOKEN}$`)),
    });
  });
});

describe("PATCH /api/qrcodes/:id — desativar e reativar", () => {
  let cenario: Cenario;

  beforeEach(async () => {
    cenario = await criarCenarioCliente();
  });

  // QR perdido ou estragado: sai só ele de circulação, não a área inteira.
  it("desativado, o código para de abrir o formulário; reativado, volta", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const desativado = await request(app)
      .patch(`/api/qrcodes/${cenario.qrCode.id}`)
      .set(comToken(token))
      .send({ ativo: false });
    const formularioFechado = await request(app).get(`/api/public/venue/${QR_TOKEN}`);

    await request(app)
      .patch(`/api/qrcodes/${cenario.qrCode.id}`)
      .set(comToken(token))
      .send({ ativo: true });
    const formularioAberto = await request(app).get(`/api/public/venue/${QR_TOKEN}`);

    expect(desativado.status).toBe(200);
    expect(desativado.body).toMatchObject({ ativo: false, area: { id: cenario.area.id } });
    expect(formularioFechado.status).toBe(404);
    expect(formularioAberto.status).toBe(200);
  });

  it("registra no log quem desativou e quem reativou", async () => {
    const { usuario, token } = await autenticar(Papel.ADMINISTRADOR);

    await request(app).patch(`/api/qrcodes/${cenario.qrCode.id}`).set(comToken(token)).send({ ativo: false });
    await request(app).patch(`/api/qrcodes/${cenario.qrCode.id}`).set(comToken(token)).send({ ativo: true });

    const registros = await prisma.auditLog.findMany({
      where: { entidade: "QRCode" },
      orderBy: { criadoEm: "asc" },
    });
    expect(registros.map((r) => r.acao)).toEqual(["QRCODE_DESATIVADO", "QRCODE_REATIVADO"]);
    expect(registros[0]).toMatchObject({
      usuarioId: usuario.id,
      entidadeId: cenario.qrCode.id,
      detalhes: { area: "Mesa 1", token: QR_TOKEN },
    });
  });

  it("repetir o mesmo estado não registra nada", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    await request(app)
      .patch(`/api/qrcodes/${cenario.qrCode.id}`)
      .set(comToken(token))
      .send({ ativo: true })
      .expect(200);

    expect(await prisma.auditLog.count({ where: { entidade: "QRCode" } })).toBe(0);
  });

  it("não reativa código de área desativada", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    await prisma.qRCode.update({ where: { id: cenario.qrCode.id }, data: { ativo: false } });
    await prisma.area.update({ where: { id: cenario.area.id }, data: { ativo: false } });

    const res = await request(app)
      .patch(`/api/qrcodes/${cenario.qrCode.id}`)
      .set(comToken(token))
      .send({ ativo: true });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("AREA_INATIVA");
    expect((await prisma.qRCode.findUniqueOrThrow({ where: { id: cenario.qrCode.id } })).ativo)
      .toBe(false);
  });

  it.each([Papel.GERENTE, Papel.COORDENADOR])("recusa %s", async (papel) => {
    const { token } = await autenticar(papel);

    const res = await request(app)
      .patch(`/api/qrcodes/${cenario.qrCode.id}`)
      .set(comToken(token))
      .send({ ativo: false });

    expect(res.status).toBe(403);
  });

  it("recusa corpo sem booleano e código inexistente", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const semBooleano = await request(app)
      .patch(`/api/qrcodes/${cenario.qrCode.id}`)
      .set(comToken(token))
      .send({ ativo: "nao" });
    const inexistente = await request(app)
      .patch("/api/qrcodes/nao-existe")
      .set(comToken(token))
      .send({ ativo: false });

    expect(semBooleano.status).toBe(400);
    expect(inexistente.status).toBe(404);
  });
});

describe("POST /api/qrcodes — substituir o código da área", () => {
  let cenario: Cenario;

  beforeEach(async () => {
    cenario = await criarCenarioCliente();
  });

  it("sem pedir, o código antigo continua valendo junto com o novo", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    await request(app).post("/api/qrcodes").set(comToken(token)).send({ areaId: cenario.area.id });

    expect(await prisma.qRCode.count({ where: { areaId: cenario.area.id, ativo: true } })).toBe(2);
  });

  // O caso do QR perdido: o novo nasce e o antigo para de aceitar feedback, junto.
  it("com desativarAnteriores, o novo nasce e os antigos da área deixam de valer", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    const outraArea = await prisma.area.create({
      data: { nome: "Varanda", venueId: cenario.venue.id },
    });
    const daOutraArea = await prisma.qRCode.create({
      data: { token: "VARANDA1", areaId: outraArea.id },
    });

    const res = await request(app)
      .post("/api/qrcodes")
      .set(comToken(token))
      .send({ areaId: cenario.area.id, desativarAnteriores: true });

    expect(res.status).toBe(201);
    const daArea = await prisma.qRCode.findMany({ where: { areaId: cenario.area.id } });
    expect(daArea.filter((q) => q.ativo).map((q) => q.token)).toEqual([res.body.token]);
    expect((await request(app).get(`/api/public/venue/${QR_TOKEN}`)).status).toBe(404);
    // Outra área não é tocada.
    expect((await prisma.qRCode.findUniqueOrThrow({ where: { id: daOutraArea.id } })).ativo).toBe(true);

    const acoes = await prisma.auditLog.findMany({
      where: { entidade: "QRCode" },
      select: { acao: true, detalhes: true },
    });
    expect(acoes).toEqual(
      expect.arrayContaining([
        { acao: "QRCODE_GERADO", detalhes: expect.objectContaining({ token: res.body.token }) },
        {
          acao: "QRCODE_DESATIVADO",
          detalhes: { area: "Mesa 1", token: QR_TOKEN, motivo: "substituido" },
        },
      ])
    );
  });

  it("recusa desativarAnteriores que não seja booleano", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .post("/api/qrcodes")
      .set(comToken(token))
      .send({ areaId: cenario.area.id, desativarAnteriores: "sim" });

    expect(res.status).toBe(400);
    expect(await prisma.qRCode.count()).toBe(1);
  });
});

// Imagem é binária para o supertest: o corpo vem em bytes, não em texto.
function emBytes(caminho: string) {
  return request(app)
    .get(caminho)
    .buffer(true)
    .parse((resposta, pronto) => {
      const partes: Buffer[] = [];
      resposta.on("data", (parte: Buffer) => partes.push(parte));
      resposta.on("end", () => pronto(null, Buffer.concat(partes)));
    });
}

describe("GET /api/qrcodes/:token/imagem", () => {
  beforeEach(async () => {
    await criarCenarioCliente();
  });

  // Vetorial: nítido no projetor e no papel, em qualquer tamanho.
  it("em SVG, para a tela de apresentação e o cartão impresso", async () => {
    const res = await emBytes(`/api/qrcodes/${QR_TOKEN}/imagem?formato=svg`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
    expect((res.body as Buffer).toString("utf8")).toContain("<svg");
  });

  it("em PNG no tamanho pedido", async () => {
    const res = await emBytes(`/api/qrcodes/${QR_TOKEN}/imagem?tamanho=1024`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    // Largura no cabeçalho IHDR do PNG (bytes 16 a 19).
    expect((res.body as Buffer).readUInt32BE(16)).toBe(1024);
  });

  it.each(["?formato=gif", "?tamanho=50", "?tamanho=5000", "?tamanho=abc"])(
    "recusa parâmetro inválido (%s)",
    async (query) => {
      const res = await request(app).get(`/api/qrcodes/${QR_TOKEN}/imagem${query}`);
      expect(res.status).toBe(400);
    }
  );
});
