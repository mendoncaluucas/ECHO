import { describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { Papel } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { autenticar, criarUsuario, SENHA_TESTE } from "./helpers.js";

const SENHA_NOVA = "senhaNova123";

function comToken(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("GET /api/users", () => {
  it("lista os usuários sem nunca expor o hash da senha", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    await criarUsuario(Papel.GERENTE, "gerente@teste.com");

    const res = await request(app).get("/api/users").set(comToken(token));

    expect(res.status).toBe(200);
    expect(res.body.itens.length).toBe(2);
    for (const item of res.body.itens) {
      expect(item).not.toHaveProperty("senhaHash");
      expect(JSON.stringify(item)).not.toContain("$2");
    }
  });

  it("recusa quem não é administrador", async () => {
    const { token } = await autenticar(Papel.GERENTE);

    const res = await request(app).get("/api/users").set(comToken(token));

    expect(res.status).toBe(403);
    expect(res.body.codigo).toBe("SEM_PERMISSAO");
  });

  it("recusa acesso sem token", async () => {
    const res = await request(app).get("/api/users");

    expect(res.status).toBe(401);
  });
});

describe("POST /api/users", () => {
  it("cria o usuário e permite que ele faça login", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .post("/api/users")
      .set(comToken(token))
      .send({
        nome: "Nova Coordenadora",
        email: "Nova@Sinuelo.com",
        senha: SENHA_NOVA,
        papel: "COORDENADOR",
        setor: " Salão ",
      });

    expect(res.status).toBe(201);
    // E-mail normalizado e setor sem espaços sobrando.
    expect(res.body.email).toBe("nova@sinuelo.com");
    expect(res.body.setor).toBe("Salão");
    expect(res.body.ativo).toBe(true);
    expect(res.body).not.toHaveProperty("senhaHash");

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "nova@sinuelo.com", senha: SENHA_NOVA });

    expect(login.status).toBe(200);
    expect(login.body.usuario.papel).toBe("COORDENADOR");
  });

  it("grava a senha com hash, nunca em texto puro", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    await request(app).post("/api/users").set(comToken(token)).send({
      nome: "Alguém",
      email: "alguem@teste.com",
      senha: SENHA_NOVA,
      papel: "GERENTE",
    });

    const gravado = await prisma.user.findUniqueOrThrow({
      where: { email: "alguem@teste.com" },
    });
    expect(gravado.senhaHash).not.toBe(SENHA_NOVA);
    expect(await bcrypt.compare(SENHA_NOVA, gravado.senhaHash)).toBe(true);
  });

  it.each([
    ["nome vazio", { nome: "  ", email: "a@b.com", senha: SENHA_NOVA, papel: "GERENTE" }],
    ["e-mail sem domínio", { nome: "X", email: "semarroba", senha: SENHA_NOVA, papel: "GERENTE" }],
    ["senha curta", { nome: "X", email: "a@b.com", senha: "1234", papel: "GERENTE" }],
    ["papel inexistente", { nome: "X", email: "a@b.com", senha: SENHA_NOVA, papel: "CHEFE" }],
  ])("recusa %s", async (_caso, corpo) => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app).post("/api/users").set(comToken(token)).send(corpo);

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("VALIDACAO");
  });

  it("recusa e-mail já cadastrado", async () => {
    const { token, usuario } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app).post("/api/users").set(comToken(token)).send({
      nome: "Repetido",
      email: usuario.email,
      senha: SENHA_NOVA,
      papel: "GERENTE",
    });

    expect(res.status).toBe(409);
  });

  it("recusa quem não é administrador", async () => {
    const { token } = await autenticar(Papel.GERENTE);

    const res = await request(app).post("/api/users").set(comToken(token)).send({
      nome: "X",
      email: "x@teste.com",
      senha: SENHA_NOVA,
      papel: "GERENTE",
    });

    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/users/:id", () => {
  it("edita nome, papel e setor", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    const alvo = await criarUsuario(Papel.COORDENADOR, "alvo@teste.com");

    const res = await request(app)
      .patch(`/api/users/${alvo.id}`)
      .set(comToken(token))
      .send({ nome: "Nome Novo", papel: "GERENTE", setor: "Cozinha" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ nome: "Nome Novo", papel: "GERENTE", setor: "Cozinha" });
  });

  it("desativa o usuário e o login passa a ser recusado", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    const alvo = await criarUsuario(Papel.GERENTE, "sai@teste.com");

    const res = await request(app)
      .patch(`/api/users/${alvo.id}`)
      .set(comToken(token))
      .send({ ativo: false });

    expect(res.status).toBe(200);
    expect(res.body.ativo).toBe(false);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "sai@teste.com", senha: SENHA_TESTE });

    expect(login.status).toBe(401);
    // Mesma mensagem de senha errada: não revela que a conta existe e foi desativada.
    expect(login.body.codigo).toBe("CREDENCIAIS_INVALIDAS");
  });

  // Sem esta trava o administrador se tranca fora e não há caminho de volta pela interface.
  it("impede o administrador de desativar a própria conta", async () => {
    const { token, usuario } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .patch(`/api/users/${usuario.id}`)
      .set(comToken(token))
      .send({ ativo: false });

    expect(res.status).toBe(400);

    const gravado = await prisma.user.findUniqueOrThrow({ where: { id: usuario.id } });
    expect(gravado.ativo).toBe(true);
  });

  it("impede o administrador de rebaixar o próprio papel", async () => {
    const { token, usuario } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .patch(`/api/users/${usuario.id}`)
      .set(comToken(token))
      .send({ papel: "GERENTE" });

    expect(res.status).toBe(400);

    const gravado = await prisma.user.findUniqueOrThrow({ where: { id: usuario.id } });
    expect(gravado.papel).toBe("ADMINISTRADOR");
  });

  it("responde 404 para id inexistente", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .patch("/api/users/00000000-0000-0000-0000-000000000000")
      .set(comToken(token))
      .send({ nome: "X" });

    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe("USUARIO_NAO_ENCONTRADO");
  });
});

describe("PATCH /api/users/:id/senha", () => {
  it("o administrador redefine a senha e a antiga deixa de valer", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    const alvo = await criarUsuario(Papel.GERENTE, "esqueci@teste.com");

    const res = await request(app)
      .patch(`/api/users/${alvo.id}/senha`)
      .set(comToken(token))
      .send({ novaSenha: SENHA_NOVA });

    expect(res.status).toBe(204);

    const comAntiga = await request(app)
      .post("/api/auth/login")
      .send({ email: "esqueci@teste.com", senha: SENHA_TESTE });
    expect(comAntiga.status).toBe(401);

    const comNova = await request(app)
      .post("/api/auth/login")
      .send({ email: "esqueci@teste.com", senha: SENHA_NOVA });
    expect(comNova.status).toBe(200);
  });

  it("recusa senha curta", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    const alvo = await criarUsuario(Papel.GERENTE, "curta@teste.com");

    const res = await request(app)
      .patch(`/api/users/${alvo.id}/senha`)
      .set(comToken(token))
      .send({ novaSenha: "123" });

    expect(res.status).toBe(400);
  });

  it("recusa quem não é administrador", async () => {
    const { token } = await autenticar(Papel.GERENTE);
    const alvo = await criarUsuario(Papel.COORDENADOR, "outro@teste.com");

    const res = await request(app)
      .patch(`/api/users/${alvo.id}/senha`)
      .set(comToken(token))
      .send({ novaSenha: SENHA_NOVA });

    expect(res.status).toBe(403);
  });
});

// O token carrega o papel e vale horas. Se a autorização confiasse só nele, desativar ou
// rebaixar alguém não teria efeito nenhum até o token expirar — e um administrador
// rebaixado conseguiria desfazer o próprio rebaixamento dentro dessa janela.
describe("o token não sobrevive à mudança de acesso", () => {
  it("desativar o usuário derruba o token que ele já tinha", async () => {
    const { token: tokenAdmin } = await autenticar(Papel.ADMINISTRADOR);
    const alvo = await criarUsuario(Papel.GERENTE, "demitido@teste.com");

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "demitido@teste.com", senha: SENHA_TESTE });
    const tokenDele = login.body.token as string;

    // Antes de desativar, o token funciona.
    const antes = await request(app).get("/api/occurrences").set(comToken(tokenDele));
    expect(antes.status).toBe(200);

    await request(app)
      .patch(`/api/users/${alvo.id}`)
      .set(comToken(tokenAdmin))
      .send({ ativo: false });

    const depois = await request(app).get("/api/occurrences").set(comToken(tokenDele));
    expect(depois.status).toBe(401);
  });

  it("rebaixar o papel vale imediatamente, mesmo com token antigo de administrador", async () => {
    const { token: tokenDeQuemManda } = await autenticar(
      Papel.ADMINISTRADOR,
      "chefe@teste.com"
    );
    const outroAdmin = await criarUsuario(Papel.ADMINISTRADOR, "segundo@teste.com");

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "segundo@teste.com", senha: SENHA_TESTE });
    const tokenAntigo = login.body.token as string;

    await request(app)
      .patch(`/api/users/${outroAdmin.id}`)
      .set(comToken(tokenDeQuemManda))
      .send({ papel: "COORDENADOR" });

    // Com o token antigo dizendo ADMINISTRADOR, ele não pode mais administrar —
    // senão se promoveria de volta.
    const res = await request(app).get("/api/users").set(comToken(tokenAntigo));

    expect(res.status).toBe(403);
  });

  it("promover o papel também vale imediatamente", async () => {
    const { token: tokenAdmin } = await autenticar(Papel.ADMINISTRADOR, "raiz@teste.com");
    const alvo = await criarUsuario(Papel.GERENTE, "promovido@teste.com");

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "promovido@teste.com", senha: SENHA_TESTE });
    const tokenDele = login.body.token as string;

    await request(app)
      .patch(`/api/users/${alvo.id}`)
      .set(comToken(tokenAdmin))
      .send({ papel: "ADMINISTRADOR" });

    const res = await request(app).get("/api/users").set(comToken(tokenDele));

    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/auth/senha", () => {
  it("o usuário troca a própria senha informando a atual", async () => {
    const { token, usuario } = await autenticar(Papel.COORDENADOR);

    const res = await request(app)
      .patch("/api/auth/senha")
      .set(comToken(token))
      .send({ senhaAtual: SENHA_TESTE, novaSenha: SENHA_NOVA });

    expect(res.status).toBe(204);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: usuario.email, senha: SENHA_NOVA });
    expect(login.status).toBe(200);
  });

  it("recusa quando a senha atual está errada", async () => {
    const { token, usuario } = await autenticar(Papel.GERENTE);

    const res = await request(app)
      .patch("/api/auth/senha")
      .set(comToken(token))
      .send({ senhaAtual: "nao-e-essa", novaSenha: SENHA_NOVA });

    expect(res.status).toBe(401);

    // A senha original continua valendo.
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: usuario.email, senha: SENHA_TESTE });
    expect(login.status).toBe(200);
  });

  it("recusa acesso sem token", async () => {
    const res = await request(app)
      .patch("/api/auth/senha")
      .send({ senhaAtual: SENHA_TESTE, novaSenha: SENHA_NOVA });

    expect(res.status).toBe(401);
  });
});
