import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";

describe("infraestrutura de teste", () => {
  it("GET /api/health responde ok", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "echo-api" });
  });

  it("rota inexistente responde 404", async () => {
    const res = await request(app).get("/api/nao-existe");

    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe("ROTA_NAO_ENCONTRADA");
  });

  it("conecta no banco de teste, e não no de desenvolvimento", async () => {
    expect(process.env.DATABASE_URL).toContain("echo_test");

    // o setup limpa as tabelas antes de cada teste
    await expect(prisma.feedback.count()).resolves.toBe(0);
  });
});
