import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { AcaoAuditoria, Papel } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { autenticar, criarCenarioCliente, criarUsuario, SENHA_TESTE } from "./helpers.js";

// Cada ação da gestão tem que deixar exatamente um rastro, com o autor certo e o
// suficiente nos detalhes para alguém reconstituir o que aconteceu sem abrir o banco.

type Cenario = Awaited<ReturnType<typeof criarCenarioCliente>>;

function comToken(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// O login do `autenticar` já grava um LOGIN; os testes olham só a ação que importa.
function registrosDe(acao: AcaoAuditoria) {
  return prisma.auditLog.findMany({ where: { acao }, orderBy: { criadoEm: "asc" } });
}

describe("auditoria: login e senhas", () => {
  it("login bem-sucedido registra quem entrou", async () => {
    const { usuario } = await autenticar(Papel.GERENTE);

    const [registro] = await registrosDe("LOGIN");
    expect(registro).toMatchObject({
      usuarioId: usuario.id,
      entidade: "User",
      entidadeId: usuario.id,
    });
  });

  it("login recusado não registra nada", async () => {
    const usuario = await criarUsuario(Papel.GERENTE);

    await request(app)
      .post("/api/auth/login")
      .send({ email: usuario.email, senha: "senha-errada" });
    await request(app)
      .post("/api/auth/login")
      .send({ email: "ninguem@teste.com", senha: SENHA_TESTE });

    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("troca da própria senha registra SENHA_ALTERADA e nunca a senha", async () => {
    const { usuario, token } = await autenticar(Papel.COORDENADOR);

    await request(app)
      .patch("/api/auth/senha")
      .set(comToken(token))
      .send({ senhaAtual: SENHA_TESTE, novaSenha: "nova-senha-123" })
      .expect(204);

    const [registro] = await registrosDe("SENHA_ALTERADA");
    expect(registro.usuarioId).toBe(usuario.id);
    expect(JSON.stringify(registro)).not.toContain("nova-senha-123");
  });

  it("redefinição pelo administrador registra o autor e o alvo, sem a senha", async () => {
    const { usuario: admin, token } = await autenticar(Papel.ADMINISTRADOR);
    const alvo = await criarUsuario(Papel.GERENTE);

    await request(app)
      .patch(`/api/users/${alvo.id}/senha`)
      .set(comToken(token))
      .send({ novaSenha: "redefinida-123" })
      .expect(204);

    const [registro] = await registrosDe("SENHA_REDEFINIDA");
    expect(registro).toMatchObject({
      usuarioId: admin.id,
      entidadeId: alvo.id,
      detalhes: { nome: alvo.nome },
    });
    expect(JSON.stringify(registro)).not.toContain("redefinida-123");
  });
});

describe("auditoria: usuários", () => {
  it("criar usuário registra nome e papel", async () => {
    const { usuario: admin, token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .post("/api/users")
      .set(comToken(token))
      .send({ nome: "Bruna", email: "bruna@teste.com", senha: "senha-123", papel: "GERENTE" })
      .expect(201);

    const [registro] = await registrosDe("USUARIO_CRIADO");
    expect(registro).toMatchObject({
      usuarioId: admin.id,
      entidade: "User",
      entidadeId: res.body.id,
      detalhes: { nome: "Bruna", papel: "GERENTE" },
    });
    expect(JSON.stringify(registro)).not.toContain("senha-123");
  });

  it("e-mail duplicado não deixa registro de criação órfão", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    const existente = await criarUsuario(Papel.GERENTE);

    await request(app)
      .post("/api/users")
      .set(comToken(token))
      .send({ nome: "X", email: existente.email, senha: "senha-123", papel: "GERENTE" })
      .expect(409);

    expect(await registrosDe("USUARIO_CRIADO")).toHaveLength(0);
  });

  it("editar registra só o que mudou, com o valor anterior", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    const alvo = await criarUsuario(Papel.COORDENADOR);

    // Nome reenviado igual não é alteração; o papel é.
    await request(app)
      .patch(`/api/users/${alvo.id}`)
      .set(comToken(token))
      .send({ nome: alvo.nome, papel: "GERENTE" })
      .expect(200);

    const [registro] = await registrosDe("USUARIO_EDITADO");
    expect(registro.detalhes).toEqual({
      nome: alvo.nome,
      alteracoes: { papel: { de: "COORDENADOR", para: "GERENTE" } },
    });
  });

  it("desativar e reativar viram eventos próprios, não edição", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    const alvo = await criarUsuario(Papel.GERENTE);

    await request(app).patch(`/api/users/${alvo.id}`).set(comToken(token)).send({ ativo: false });
    await request(app).patch(`/api/users/${alvo.id}`).set(comToken(token)).send({ ativo: true });

    expect(await registrosDe("USUARIO_DESATIVADO")).toHaveLength(1);
    expect(await registrosDe("USUARIO_REATIVADO")).toHaveLength(1);
    expect(await registrosDe("USUARIO_EDITADO")).toHaveLength(0);
  });

  it("PATCH que não muda nada não registra nada", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    const alvo = await criarUsuario(Papel.GERENTE);

    await request(app)
      .patch(`/api/users/${alvo.id}`)
      .set(comToken(token))
      .send({ nome: alvo.nome, papel: alvo.papel, ativo: true })
      .expect(200);

    expect(await prisma.auditLog.count({ where: { acao: { not: "LOGIN" } } })).toBe(0);
  });
});

describe("auditoria: áreas", () => {
  let cenario: Cenario;

  beforeEach(async () => {
    cenario = await criarCenarioCliente();
  });

  it("criar área registra o nome já normalizado", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .post("/api/areas")
      .set(comToken(token))
      .send({ nome: "  Varanda  " })
      .expect(201);

    const [registro] = await registrosDe("AREA_CRIADA");
    expect(registro).toMatchObject({ entidadeId: res.body.id, detalhes: { nome: "Varanda" } });
  });

  it("renomear guarda o nome antigo e o novo", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    await request(app)
      .patch(`/api/areas/${cenario.area.id}`)
      .set(comToken(token))
      .send({ nome: "Mesa 1 - Janela" })
      .expect(200);

    const [registro] = await registrosDe("AREA_RENOMEADA");
    expect(registro.detalhes).toEqual({ de: "Mesa 1", para: "Mesa 1 - Janela" });
  });

  // Renomear depois não pode reescrever o passado: o log mostra o nome da época.
  it("o registro antigo mantém o nome que a área tinha na hora", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    await request(app).patch(`/api/areas/${cenario.area.id}`).set(comToken(token)).send({ ativo: false });
    await request(app).patch(`/api/areas/${cenario.area.id}`).set(comToken(token)).send({ nome: "Outro" });

    const [desativacao] = await registrosDe("AREA_DESATIVADA");
    expect(desativacao.detalhes).toEqual({ nome: "Mesa 1" });
  });

  it("reenviar o mesmo nome com espaços não conta como renomear", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    await request(app)
      .patch(`/api/areas/${cenario.area.id}`)
      .set(comToken(token))
      .send({ nome: "  Mesa 1  " })
      .expect(200);

    expect(await registrosDe("AREA_RENOMEADA")).toHaveLength(0);
  });
});

describe("auditoria: QR Code e ocorrências", () => {
  let cenario: Cenario;

  beforeEach(async () => {
    cenario = await criarCenarioCliente();
  });

  it("gerar QR Code registra o autor e a área", async () => {
    const { usuario: admin, token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .post("/api/qrcodes")
      .set(comToken(token))
      .send({ areaId: cenario.area.id })
      .expect(201);

    const [registro] = await registrosDe("QRCODE_GERADO");
    expect(registro).toMatchObject({
      usuarioId: admin.id,
      entidade: "QRCode",
      entidadeId: res.body.id,
      detalhes: { area: "Mesa 1", token: res.body.token },
    });
  });

  it("mudar o status registra de onde para onde, e quem mudou", async () => {
    const { usuario, token } = await autenticar(Papel.COORDENADOR);
    const feedback = await prisma.feedback.create({
      data: { venueId: cenario.venue.id, areaId: cenario.area.id, tipo: "RECLAMACAO" },
    });

    await request(app)
      .patch(`/api/occurrences/${feedback.id}`)
      .set(comToken(token))
      .send({ status: "EM_ANDAMENTO" })
      .expect(200);

    const [registro] = await registrosDe("OCORRENCIA_STATUS");
    expect(registro).toMatchObject({
      usuarioId: usuario.id,
      entidade: "Feedback",
      entidadeId: feedback.id,
      detalhes: { de: "PENDENTE", para: "EM_ANDAMENTO", area: "Mesa 1" },
    });
  });

  it("reenviar o mesmo status não registra nada", async () => {
    const { token } = await autenticar(Papel.COORDENADOR);
    const feedback = await prisma.feedback.create({
      data: { venueId: cenario.venue.id, areaId: cenario.area.id, tipo: "ELOGIO" },
    });

    await request(app)
      .patch(`/api/occurrences/${feedback.id}`)
      .set(comToken(token))
      .send({ status: "PENDENTE" })
      .expect(200);

    expect(await registrosDe("OCORRENCIA_STATUS")).toHaveLength(0);
  });
});
