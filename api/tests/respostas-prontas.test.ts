import { describe, expect, it } from "vitest";
import request from "supertest";
import { Papel } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { autenticar } from "./helpers.js";

const comToken = (token: string) => ({ Authorization: `Bearer ${token}` });
const ROTA = "/api/respostas-prontas";

function criar(token: string, corpo: Record<string, unknown>) {
  return request(app).post(ROTA).set(comToken(token)).send(corpo);
}

function editar(token: string, id: string, corpo: Record<string, unknown>) {
  return request(app).patch(`${ROTA}/${id}`).set(comToken(token)).send(corpo);
}

describe("respostas prontas", () => {
  it("o administrador cadastra; título e texto saem aparados, com \\n no lugar de \\r\\n", async () => {
    const { usuario, token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await criar(token, { titulo: "  Pedido de desculpas ", texto: " Sentimos muito.\r\n\r\nVolte sempre. " });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ titulo: "Pedido de desculpas", texto: "Sentimos muito.\n\nVolte sempre.", ativo: true });

    const log = await prisma.auditLog.findFirstOrThrow({ where: { acao: "RESPOSTA_PRONTA_CRIADA" } });
    expect(log).toMatchObject({
      usuarioId: usuario.id,
      entidade: "RespostaPronta",
      entidadeId: res.body.id,
      detalhes: { titulo: "Pedido de desculpas" },
    });
  });

  it("toda a gestão lê, ativas primeiro e em ordem de título", async () => {
    const { token: admin } = await autenticar(Papel.ADMINISTRADOR);
    const b = await criar(admin, { titulo: "B", texto: "b" });
    await criar(admin, { titulo: "C", texto: "c" });
    await criar(admin, { titulo: "A", texto: "a" });
    await editar(admin, b.body.id, { ativo: false });

    for (const papel of [Papel.COORDENADOR, Papel.GERENTE]) {
      const { token } = await autenticar(papel);
      const res = await request(app).get(ROTA).set(comToken(token));
      expect(res.status).toBe(200);
      expect(res.body.itens.map((m: { titulo: string; ativo: boolean }) => `${m.titulo}:${m.ativo}`)).toEqual([
        "A:true",
        "C:true",
        "B:false",
      ]);
    }
  });

  it.each([Papel.COORDENADOR, Papel.GERENTE])("%s não cadastra nem edita (403)", async (papel) => {
    const { token: admin } = await autenticar(Papel.ADMINISTRADOR);
    const modelo = await criar(admin, { titulo: "A", texto: "a" });
    const { token } = await autenticar(papel);

    expect((await criar(token, { titulo: "X", texto: "x" })).status).toBe(403);
    expect((await editar(token, modelo.body.id, { ativo: false })).status).toBe(403);
  });

  it("sem login, 401", async () => {
    expect((await request(app).get(ROTA)).status).toBe(401);
  });

  it.each([
    ["sem título", { texto: "x" }],
    ["título vazio", { titulo: "   ", texto: "x" }],
    ["título longo", { titulo: "x".repeat(81), texto: "x" }],
    ["sem texto", { titulo: "A" }],
    ["texto longo", { titulo: "A", texto: "x".repeat(1501) }],
    ["texto não é texto", { titulo: "A", texto: 3 }],
  ])("cadastro inválido (%s): 400", async (_nome, corpo) => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    const res = await criar(token, corpo);
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("VALIDACAO");
  });

  it("nos limites (80 no título, 1500 no texto), passa", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    expect((await criar(token, { titulo: "t".repeat(80), texto: "x".repeat(1500) })).status).toBe(201);
  });

  it("título repetido em outra grafia: 409; com curinga (%) não confunde com outro", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    await criar(token, { titulo: "Pedido de desculpas", texto: "a" });

    const repetido = await criar(token, { titulo: "PEDIDO DE DESCULPAS", texto: "b" });
    expect(repetido.status).toBe(409);
    expect(repetido.body.codigo).toBe("CONFLITO");

    expect((await criar(token, { titulo: "%", texto: "c" })).status).toBe(201);
  });

  it("editar: muda só o que veio; o log diz o título e se o texto mudou, sem o texto", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    const modelo = await criar(token, { titulo: "Desculpas", texto: "Texto antigo" });

    const res = await editar(token, modelo.body.id, { titulo: "Pedido de desculpas", texto: "Texto novo" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ titulo: "Pedido de desculpas", texto: "Texto novo", ativo: true });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { acao: "RESPOSTA_PRONTA_EDITADA" } });
    expect(log.detalhes).toEqual({ titulo: "Pedido de desculpas", tituloAnterior: "Desculpas", textoMudou: true });
    expect(JSON.stringify(log.detalhes)).not.toContain("Texto novo");
  });

  it("mudar só a grafia do próprio título é permitido", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    const modelo = await criar(token, { titulo: "desculpas", texto: "a" });
    const res = await editar(token, modelo.body.id, { titulo: "Desculpas" });
    expect(res.status).toBe(200);
    expect(res.body.titulo).toBe("Desculpas");
  });

  it("renomear para o título de outro: 409", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    await criar(token, { titulo: "Elogio", texto: "a" });
    const outro = await criar(token, { titulo: "Desculpas", texto: "b" });
    expect((await editar(token, outro.body.id, { titulo: "elogio" })).status).toBe(409);
  });

  it("desativar e reativar: um registro cada no log; reenviar o mesmo valor não registra", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    const modelo = await criar(token, { titulo: "A", texto: "a" });

    await editar(token, modelo.body.id, { ativo: false });
    await editar(token, modelo.body.id, { ativo: false });
    await editar(token, modelo.body.id, { ativo: true });
    await editar(token, modelo.body.id, { titulo: "A", texto: "a" });

    const acoes = (await prisma.auditLog.findMany({ where: { entidade: "RespostaPronta" }, orderBy: { criadoEm: "asc" } })).map(
      (r) => r.acao
    );
    expect(acoes).toEqual(["RESPOSTA_PRONTA_CRIADA", "RESPOSTA_PRONTA_DESATIVADA", "RESPOSTA_PRONTA_REATIVADA"]);
  });

  it.each([
    ["título vazio", { titulo: "" }],
    ["texto vazio", { texto: "  " }],
    ["ativo não booleano", { ativo: "false" }],
  ])("edição inválida (%s): 400", async (_nome, corpo) => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    const modelo = await criar(token, { titulo: "A", texto: "a" });
    expect((await editar(token, modelo.body.id, corpo)).status).toBe(400);
  });

  it("modelo inexistente: 404", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    const res = await editar(token, "00000000-0000-0000-0000-000000000000", { ativo: false });
    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe("RESPOSTA_PRONTA_NAO_ENCONTRADA");
  });
});
