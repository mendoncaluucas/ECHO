import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { CATEGORIAS, QR_TOKEN, criarCenarioCliente } from "./helpers.js";

describe("GET /api/public/venue/:qrToken", () => {
  it("resolve o QR Code e devolve o contexto do formulário", async () => {
    const cenario = await criarCenarioCliente();

    const res = await request(app).get(`/api/public/venue/${QR_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.venue).toEqual({ id: cenario.venue.id, nome: "Restaurante Teste" });
    expect(res.body.area).toEqual({ id: cenario.area.id, nome: "Mesa 1" });
    expect(res.body.categorias.map((c: { nome: string }) => c.nome)).toEqual(
      [...CATEGORIAS].sort()
    );
  });

  it("responde 404 para token inexistente", async () => {
    await criarCenarioCliente();

    const res = await request(app).get("/api/public/venue/NAO-EXISTE");

    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe("QR_NAO_ENCONTRADO");
  });

  it("responde 404 para QR Code inativo", async () => {
    const cenario = await criarCenarioCliente();
    await prisma.qRCode.update({
      where: { id: cenario.qrCode.id },
      data: { ativo: false },
    });

    const res = await request(app).get(`/api/public/venue/${QR_TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe("QR_NAO_ENCONTRADO");
  });
});
