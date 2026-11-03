import { describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { Papel } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { autenticar, criarUsuario, SENHA_TESTE } from "./helpers.js";

// Trocar ou redefinir a senha derruba as outras sessões da pessoa. Ver
// docs/PROXIMOS-PASSOS.md, seção 8, e User.versaoDaSessao no schema.

const SENHA_NOVA = "senha-nova-456";
const comToken = (token: string) => ({ Authorization: `Bearer ${token}` });

// Uma rota qualquer da gestão, aberta a todos os papéis: responde 200 com a sessão viva.
const sessaoVale = async (token: string) =>
  (await request(app).get("/api/notifications/contagem").set(comToken(token))).status === 200;

async function entrar(email: string, senha = SENHA_TESTE) {
  const res = await request(app).post("/api/auth/login").send({ email, senha });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

const trocarSenha = (token: string, senhaAtual: string, novaSenha: string) =>
  request(app).patch("/api/auth/senha").set(comToken(token)).send({ senhaAtual, novaSenha });

describe("trocar a própria senha", () => {
  it("as outras sessões caem; esta continua com o token novo que volta na resposta", async () => {
    const { usuario, token: noCelular } = await autenticar(Papel.GERENTE);
    const noComputador = await entrar(usuario.email);

    const res = await trocarSenha(noComputador, SENHA_TESTE, SENHA_NOVA);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(["token"]);
    expect(await sessaoVale(res.body.token)).toBe(true);

    const derrubada = await request(app).get("/api/notifications/contagem").set(comToken(noCelular));
    expect(derrubada.status).toBe(401);
    expect(derrubada.body).toEqual({ erro: "Sessão encerrada: a senha foi trocada", codigo: "TOKEN_INVALIDO" });
    // O próprio token usado para trocar também morre: quem continua é o novo.
    expect(await sessaoVale(noComputador)).toBe(false);
  });

  it("o token novo mantém o papel, e entrar com a senha nova dá uma sessão que vale", async () => {
    const { usuario, token } = await autenticar(Papel.ADMINISTRADOR);

    const { body } = await trocarSenha(token, SENHA_TESTE, SENHA_NOVA);

    expect(jwt.decode(body.token)).toMatchObject({ sub: usuario.id, papel: "ADMINISTRADOR", v: 1 });
    expect((await request(app).get("/api/users").set(comToken(body.token))).status).toBe(200);
    expect(await sessaoVale(await entrar(usuario.email, SENHA_NOVA))).toBe(true);
  });

  it("trocar duas vezes derruba de novo (o número só cresce)", async () => {
    const { usuario, token } = await autenticar(Papel.COORDENADOR);
    const primeira = (await trocarSenha(token, SENHA_TESTE, SENHA_NOVA)).body.token;
    const outra = await entrar(usuario.email, SENHA_NOVA);

    const segunda = (await trocarSenha(primeira, SENHA_NOVA, "terceira-senha-789")).body.token;

    expect(await sessaoVale(segunda)).toBe(true);
    expect(await sessaoVale(primeira)).toBe(false);
    expect(await sessaoVale(outra)).toBe(false);
  });

  it("senha atual errada não troca nada nem derruba ninguém", async () => {
    const { usuario, token } = await autenticar(Papel.GERENTE);
    const outra = await entrar(usuario.email);

    const res = await trocarSenha(token, "nao-e-essa", SENHA_NOVA);

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe("CREDENCIAIS_INVALIDAS");
    expect(await sessaoVale(token)).toBe(true);
    expect(await sessaoVale(outra)).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: usuario.id } })).versaoDaSessao).toBe(0);
  });

  it("a nova igual à atual é recusada, sem derrubar ninguém", async () => {
    // A senha dos testes (echo123) é curta demais para ser nova: troca para uma que serve.
    const { token: inicial } = await autenticar(Papel.GERENTE);
    const token = (await trocarSenha(inicial, SENHA_TESTE, SENHA_NOVA)).body.token;

    const res = await trocarSenha(token, SENHA_NOVA, SENHA_NOVA);

    expect(res.status).toBe(400);
    expect(res.body.erro).toBe("A nova senha precisa ser diferente da atual");
    expect(await sessaoVale(token)).toBe(true);
  });

  it("não mexe nas sessões das outras pessoas", async () => {
    const { token } = await autenticar(Papel.GERENTE);
    const { token: colega } = await autenticar(Papel.COORDENADOR);

    await trocarSenha(token, SENHA_TESTE, SENHA_NOVA);

    expect(await sessaoVale(colega)).toBe(true);
  });
});

describe("limite de senhas atuais erradas na troca", () => {
  it("5 erros em 15 minutos: a 6ª tentativa recebe 429, mesmo com a senha certa", async () => {
    const { token } = await autenticar(Papel.GERENTE);
    for (let i = 0; i < 5; i++) expect((await trocarSenha(token, "errada", SENHA_NOVA)).status).toBe(401);

    const res = await trocarSenha(token, SENHA_TESTE, SENHA_NOVA);

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      erro: "Muitas tentativas de trocar a senha. Tente de novo em 15 minutos.",
      codigo: "MUITAS_REQUISICOES",
    });
    // Bloqueada a troca, a sessão em si continua: não é motivo para sair.
    expect(await sessaoVale(token)).toBe(true);
  });

  it("é por pessoa: errar a de uma não bloqueia a troca da outra", async () => {
    const { token } = await autenticar(Papel.GERENTE);
    const { token: colega } = await autenticar(Papel.COORDENADOR);
    for (let i = 0; i < 5; i++) await trocarSenha(token, "errada", SENHA_NOVA);

    expect((await trocarSenha(colega, SENHA_TESTE, SENHA_NOVA)).status).toBe(200);
  });

  it("trocar com sucesso não gasta tentativa", async () => {
    let { token } = await autenticar(Papel.GERENTE);
    let atual = SENHA_TESTE;
    for (let i = 0; i < 6; i++) {
      const nova = `senha-numero-${i}`;
      const res = await trocarSenha(token, atual, nova);
      expect(res.status).toBe(200);
      token = res.body.token;
      atual = nova;
    }
  });
});

describe("administrador redefine a senha de alguém", () => {
  it("todas as sessões da pessoa caem; a do administrador continua", async () => {
    const { token: admin } = await autenticar(Papel.ADMINISTRADOR);
    const alvo = await criarUsuario(Papel.GERENTE);
    const noCelular = await entrar(alvo.email);
    const noComputador = await entrar(alvo.email);

    const res = await request(app)
      .patch(`/api/users/${alvo.id}/senha`)
      .set(comToken(admin))
      .send({ novaSenha: SENHA_NOVA });

    expect(res.status).toBe(204);
    expect(await sessaoVale(noCelular)).toBe(false);
    expect(await sessaoVale(noComputador)).toBe(false);
    expect(await sessaoVale(admin)).toBe(true);
    expect(await sessaoVale(await entrar(alvo.email, SENHA_NOVA))).toBe(true);
  });

  it("a própria senha, não: 400 PROPRIA_SENHA, sem trocar nada nem derrubar a sessão", async () => {
    const { usuario, token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .patch(`/api/users/${usuario.id}/senha`)
      .set(comToken(token))
      .send({ novaSenha: SENHA_NOVA });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("PROPRIA_SENHA");
    expect(await sessaoVale(token)).toBe(true);
    expect(await sessaoVale(await entrar(usuario.email))).toBe(true);
  });
});

describe("desativar e reativar", () => {
  it("reativada no mesmo dia, a pessoa entra de novo: as sessões de antes não voltam a valer", async () => {
    const { token: admin } = await autenticar(Papel.ADMINISTRADOR);
    const alvo = await criarUsuario(Papel.COORDENADOR);
    const antiga = await entrar(alvo.email);
    const mudarSituacao = (ativo: boolean) =>
      request(app).patch(`/api/users/${alvo.id}`).set(comToken(admin)).send({ ativo });

    expect((await mudarSituacao(false)).status).toBe(200);
    expect(await sessaoVale(antiga)).toBe(false);
    expect((await mudarSituacao(true)).status).toBe(200);

    expect(await sessaoVale(antiga)).toBe(false);
    expect(await sessaoVale(await entrar(alvo.email))).toBe(true);
  });

  it("editar nome, papel ou setor não derruba ninguém", async () => {
    const { token: admin } = await autenticar(Papel.ADMINISTRADOR);
    const alvo = await criarUsuario(Papel.COORDENADOR);
    const sessao = await entrar(alvo.email);

    await request(app)
      .patch(`/api/users/${alvo.id}`)
      .set(comToken(admin))
      .send({ nome: "Nome Novo", papel: "GERENTE", setor: "Salão", ativo: true });

    expect(await sessaoVale(sessao)).toBe(true);
  });
});

describe("tokens de antes desta mudança", () => {
  // Assinado como o login fazia até 03/11: sem o `v`.
  const tokenSemVersao = (sub: string, papel: Papel) =>
    jwt.sign({ sub, papel }, process.env.JWT_SECRET!, { expiresIn: "24h" });

  it("continuam valendo depois do deploy (contam como versão 0)", async () => {
    const usuario = await criarUsuario(Papel.GERENTE);
    expect(await sessaoVale(tokenSemVersao(usuario.id, usuario.papel))).toBe(true);
  });

  it("e caem como os outros quando a senha muda", async () => {
    const usuario = await criarUsuario(Papel.GERENTE);
    const antigo = tokenSemVersao(usuario.id, usuario.papel);

    const res = await trocarSenha(antigo, SENHA_TESTE, SENHA_NOVA);

    expect(res.status).toBe(200);
    expect(await sessaoVale(antigo)).toBe(false);
    expect(await sessaoVale(res.body.token)).toBe(true);
  });

  it("um `v` que não é número inteiro conta como 0, e não passa por outra versão", async () => {
    const usuario = await criarUsuario(Papel.GERENTE);
    await prisma.user.update({ where: { id: usuario.id }, data: { versaoDaSessao: 1 } });
    const estranho = jwt.sign({ sub: usuario.id, papel: usuario.papel, v: "1" }, process.env.JWT_SECRET!);

    expect(await sessaoVale(estranho)).toBe(false);
  });
});
