import { describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { Papel } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { autenticar, criarUsuario } from "./helpers.js";

const HORA = 60 * 60;

function comToken(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// Token como o do login, mas emitido `horasAtras` horas atrás: é como se mede a
// idade de uma sessão aberta sem esperar o relógio andar.
function tokenEmitidoHa(usuario: { id: string; papel: Papel }, horasAtras: number) {
  const emitidoEm = Math.floor(Date.now() / 1000) - horasAtras * HORA;
  return jwt.sign(
    { sub: usuario.id, papel: usuario.papel, iat: emitidoEm },
    process.env.JWT_SECRET!,
    { expiresIn: "24h" }
  );
}

async function definirDuracao(horas: number) {
  await prisma.configuracao.upsert({
    where: { id: "sistema" },
    create: { id: "sistema", duracaoSessaoHoras: horas },
    update: { duracaoSessaoHoras: horas },
  });
}

// Qualquer rota protegida serve para ver se a sessão ainda vale.
function sessaoValida(token: string) {
  return request(app).get("/api/notifications/contagem").set(comToken(token));
}

describe("GET /api/configuracoes", () => {
  it("sem nada salvo, devolve o padrão de 8 horas", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app).get("/api/configuracoes").set(comToken(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ duracaoSessaoHoras: 8 });
  });

  it.each([Papel.GERENTE, Papel.COORDENADOR])("recusa %s", async (papel) => {
    const { token } = await autenticar(papel);
    const res = await request(app).get("/api/configuracoes").set(comToken(token));
    expect(res.status).toBe(403);
  });

  it("recusa acesso sem token", async () => {
    const res = await request(app).get("/api/configuracoes");
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/configuracoes", () => {
  it("salva a duração da sessão e ela passa a valer na leitura", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .patch("/api/configuracoes")
      .set(comToken(token))
      .send({ duracaoSessaoHoras: 4 });
    const lida = await request(app).get("/api/configuracoes").set(comToken(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ duracaoSessaoHoras: 4 });
    expect(lida.body).toEqual({ duracaoSessaoHoras: 4 });
  });

  it.each([0, 25, 2.5, "4", null])("recusa duração inválida (%s)", async (valor) => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .patch("/api/configuracoes")
      .set(comToken(token))
      .send({ duracaoSessaoHoras: valor });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("VALIDACAO");
  });

  it("recusa quem não é administrador", async () => {
    const { token } = await autenticar(Papel.GERENTE);

    const res = await request(app)
      .patch("/api/configuracoes")
      .set(comToken(token))
      .send({ duracaoSessaoHoras: 24 });

    expect(res.status).toBe(403);
    expect(await prisma.configuracao.count()).toBe(0);
  });

  it("registra no log quem mudou, de quanto para quanto", async () => {
    const { usuario, token } = await autenticar(Papel.ADMINISTRADOR);

    await request(app)
      .patch("/api/configuracoes")
      .set(comToken(token))
      .send({ duracaoSessaoHoras: 2 })
      .expect(200);

    const registro = await prisma.auditLog.findFirstOrThrow({
      where: { acao: "CONFIGURACAO_ALTERADA" },
    });
    expect(registro).toMatchObject({
      usuarioId: usuario.id,
      entidade: "Configuracao",
      detalhes: { campo: "duracaoSessaoHoras", de: 8, para: 2 },
    });
  });

  it("salvar o mesmo valor não registra nada", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    await request(app)
      .patch("/api/configuracoes")
      .set(comToken(token))
      .send({ duracaoSessaoHoras: 8 })
      .expect(200);

    expect(await prisma.auditLog.count({ where: { acao: "CONFIGURACAO_ALTERADA" } })).toBe(0);
  });
});

describe("duração da sessão", () => {
  it("o login sai com o teto de 24h, não com a duração configurada", async () => {
    await definirDuracao(2);
    const { token } = await autenticar(Papel.GERENTE);

    const { iat, exp } = jwt.decode(token) as jwt.JwtPayload;

    expect(exp! - iat!).toBe(24 * HORA);
  });

  it("sessão dentro da duração configurada vale", async () => {
    const gerente = await criarUsuario(Papel.GERENTE);

    const res = await sessaoValida(tokenEmitidoHa(gerente, 7));

    expect(res.status).toBe(200); // padrão de 8h
  });

  it("sessão mais velha que a duração configurada cai", async () => {
    const gerente = await criarUsuario(Papel.GERENTE);

    const res = await sessaoValida(tokenEmitidoHa(gerente, 9));

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ erro: "Sessão expirada", codigo: "TOKEN_INVALIDO" });
  });

  // O motivo de conferir a cada requisição: quem encurta por segurança espera que
  // as sessões abertas sintam a mudança agora, não no próximo login.
  it("encurtar derruba na hora a sessão já aberta", async () => {
    const gerente = await criarUsuario(Papel.GERENTE);
    const token = tokenEmitidoHa(gerente, 3);
    expect((await sessaoValida(token)).status).toBe(200);

    await definirDuracao(2);

    expect((await sessaoValida(token)).status).toBe(401);
  });

  it("alongar estende a sessão já aberta", async () => {
    await definirDuracao(2);
    const gerente = await criarUsuario(Papel.GERENTE);
    const token = tokenEmitidoHa(gerente, 3);
    expect((await sessaoValida(token)).status).toBe(401);

    await definirDuracao(12);

    expect((await sessaoValida(token)).status).toBe(200);
  });

  it("o teto de 24h vale mesmo com a duração no máximo", async () => {
    await definirDuracao(24);
    const gerente = await criarUsuario(Papel.GERENTE);

    const res = await sessaoValida(tokenEmitidoHa(gerente, 25));

    expect(res.status).toBe(401);
  });
});
