import { describe, expect, it } from "vitest";
import request from "supertest";
import { Papel } from "@prisma/client";
import { app } from "../src/app.js";
import { SENHA_TESTE, criarUsuario } from "./helpers.js";

describe("POST /api/auth/login", () => {
  it("autentica e devolve token com os dados do usuário", async () => {
    const usuario = await criarUsuario(Papel.GERENTE);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: usuario.email, senha: SENHA_TESTE });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.usuario).toEqual({
      id: usuario.id,
      nome: usuario.nome,
      papel: "GERENTE",
    });
  });

  it("nunca expõe o hash da senha na resposta", async () => {
    const usuario = await criarUsuario(Papel.GERENTE);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: usuario.email, senha: SENHA_TESTE });

    expect(JSON.stringify(res.body)).not.toContain("senhaHash");
    expect(res.body.usuario.senhaHash).toBeUndefined();
  });

  it("recusa senha incorreta", async () => {
    const usuario = await criarUsuario(Papel.GERENTE);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: usuario.email, senha: "senha-errada" });

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe("CREDENCIAIS_INVALIDAS");
  });

  // Proteção contra enumeração de usuários: descobrir quais e-mails têm cadastro
  // não pode ser possível pela resposta.
  it("responde igual para e-mail inexistente e para senha errada", async () => {
    const usuario = await criarUsuario(Papel.GERENTE);

    const senhaErrada = await request(app)
      .post("/api/auth/login")
      .send({ email: usuario.email, senha: "senha-errada" });

    const emailInexistente = await request(app)
      .post("/api/auth/login")
      .send({ email: "ninguem@teste.com", senha: SENHA_TESTE });

    expect(emailInexistente.status).toBe(senhaErrada.status);
    expect(emailInexistente.body).toEqual(senhaErrada.body);
  });

  it("recusa requisição sem e-mail", async () => {
    const res = await request(app).post("/api/auth/login").send({ senha: SENHA_TESTE });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("VALIDACAO");
  });

  it("recusa requisição sem senha", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "alguem@teste.com" });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("VALIDACAO");
  });
});
