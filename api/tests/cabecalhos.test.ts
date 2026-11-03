import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Request, Response } from "express";
import { app } from "../src/app.js";
import { errorHandler } from "../src/middlewares/errorHandler.js";
import { prisma } from "../src/prisma.js";
import { criarCenarioCliente, QR_TOKEN } from "./helpers.js";

// Erros do corpo do pedido e cabeçalhos de segurança. Ver docs/PROXIMOS-PASSOS.md, seção 8.

afterEach(() => {
  vi.restoreAllMocks();
});

const comoJson = (caminho: string, corpo: string, tipo = "application/json") =>
  request(app).post(caminho).set("Content-Type", tipo).send(corpo);

describe("corpo do pedido", () => {
  it("JSON malformado: 400 JSON_INVALIDO, sem ir para o log como erro", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await comoJson("/api/auth/login", '{"email": "a@b.com", "senha":');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ erro: "O corpo do pedido não é um JSON válido", codigo: "JSON_INVALIDO" });
    expect(log).not.toHaveBeenCalled();
  });

  it("JSON que não é objeto nem lista (o leitor é estrito): 400 JSON_INVALIDO", async () => {
    const res = await comoJson("/api/public/feedback", '"só um texto"');
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("JSON_INVALIDO");
  });

  it("corpo acima de 100 kB: 413 CORPO_GRANDE_DEMAIS, sem ir para o log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const corpo = JSON.stringify({ qrToken: QR_TOKEN, comentario: "a".repeat(110 * 1024) });

    const res = await comoJson("/api/public/feedback", corpo);

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ erro: "O corpo do pedido passa de 100 kB", codigo: "CORPO_GRANDE_DEMAIS" });
    expect(log).not.toHaveBeenCalled();
  });

  it("abaixo de 100 kB, o pedido chega à rota, que faz a validação dela", async () => {
    await criarCenarioCliente();
    const corpo = JSON.stringify({ qrToken: QR_TOKEN, tipo: "ELOGIO", comentario: "a".repeat(90 * 1024), avaliacoes: [] });

    const res = await comoJson("/api/public/feedback", corpo);

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("VALIDACAO");
  });

  it("charset que o leitor não conhece: 415 PEDIDO_INVALIDO, sem ir para o log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await comoJson("/api/auth/login", '{"email":"a@b.com"}', "application/json; charset=klingon");

    expect(res.status).toBe(415);
    expect(res.body.codigo).toBe("PEDIDO_INVALIDO");
    expect(log).not.toHaveBeenCalled();
  });

  it("só o erro marcado como culpa do pedido (expose) vira 4xx; o resto é 500 e vai para o log", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const responder = (err: unknown) => {
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
      errorHandler(err, {} as Request, res as unknown as Response, () => {});
      return res.status.mock.calls[0][0];
    };

    expect(responder(Object.assign(new Error("x"), { type: "entity.parse.failed", status: 400, expose: true }))).toBe(400);
    expect(responder(Object.assign(new Error("x"), { type: "entity.parse.failed", status: 400, expose: false }))).toBe(500);
    expect(responder(Object.assign(new Error("x"), { type: "qualquer", status: 503, expose: true }))).toBe(500);
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("erro de verdade da API continua 500 e vai para o log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.qRCode, "findUnique").mockRejectedValue(new Error("banco caiu"));

    const res = await request(app).get(`/api/public/venue/${QR_TOKEN}`);

    expect(res.status).toBe(500);
    expect(res.body.codigo).toBe("ERRO_INTERNO");
    expect(log).toHaveBeenCalledWith("Erro não tratado:", expect.any(Error));
  });
});

describe("cabeçalhos de segurança", () => {
  const esperados = {
    "content-security-policy": "default-src 'none';frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
    "cross-origin-resource-policy": "cross-origin",
  };

  it.each([
    ["saúde", "/api/health", 200],
    ["rota inexistente", "/api/nao-existe", 404],
    ["rota protegida sem login", "/api/occurrences", 401],
  ])("em toda resposta (%s), sem X-Powered-By", async (_nome, caminho, status) => {
    const res = await request(app).get(caminho);

    expect(res.status).toBe(status);
    expect(res.headers).toMatchObject(esperados);
    expect(res.headers["strict-transport-security"]).toMatch(/^max-age=\d+/);
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("também no erro do corpo e no 429", async () => {
    expect((await comoJson("/api/auth/login", "{")).headers).toMatchObject(esperados);
    for (let i = 0; i < 60; i++) await request(app).get("/api/public/venue/X");
    const limitado = await request(app).get("/api/public/venue/X");
    expect(limitado.status).toBe(429);
    expect(limitado.headers).toMatchObject(esperados);
  });

  it("a imagem do QR sai com Cross-Origin-Resource-Policy cross-origin: a tela de QR Codes a carrega de outro endereço", async () => {
    await criarCenarioCliente();

    const res = await request(app).get(`/api/qrcodes/${QR_TOKEN}/imagem?formato=svg`);

    expect(res.status).toBe(200);
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(res.headers["content-type"]).toMatch(/^image\/svg\+xml/);
  });

  it("o CORS continua respondendo (o helmet não atrapalha a pergunta prévia do navegador)", async () => {
    const res = await request(app)
      .options("/api/auth/login")
      .set("Origin", "https://exemplo.vercel.app")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBeDefined();
  });
});
