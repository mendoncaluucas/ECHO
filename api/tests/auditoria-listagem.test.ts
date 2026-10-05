import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Papel } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { autenticar, criarCenarioCliente } from "./helpers.js";

type Cenario = Awaited<ReturnType<typeof criarCenarioCliente>>;

function comToken(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("GET /api/audit", () => {
  it("recusa acesso sem token", async () => {
    const res = await request(app).get("/api/audit");
    expect(res.status).toBe(401);
  });

  // O log mostra quem mexeu em quê na equipe inteira; é assunto do administrador.
  it.each([Papel.GERENTE, Papel.COORDENADOR])("recusa %s", async (papel) => {
    const { token } = await autenticar(papel);
    const res = await request(app).get("/api/audit").set(comToken(token));
    expect(res.status).toBe(403);
  });

  it("lista do mais recente ao mais antigo, com o nome de quem agiu", async () => {
    const { usuario: admin, token } = await autenticar(Papel.ADMINISTRADOR);
    await request(app).post("/api/areas").set(comToken(token)).send({ nome: "Inexistente" });
    await criarCenarioCliente();
    await request(app).post("/api/areas").set(comToken(token)).send({ nome: "Varanda" });

    const res = await request(app).get("/api/audit").set(comToken(token));

    expect(res.status).toBe(200);
    // LOGIN do autenticar + AREA_CRIADA. A primeira tentativa falhou (sem restaurante)
    // e não pode ter deixado rastro.
    expect(res.body.total).toBe(2);
    expect(res.body.itens.map((i: { acao: string }) => i.acao)).toEqual(["AREA_CRIADA", "LOGIN"]);
    expect(res.body.itens[0]).toMatchObject({
      entidade: "Area",
      detalhes: { nome: "Varanda" },
      usuario: { id: admin.id, nome: admin.nome },
    });
  });

  it("não vaza dado sensível de quem agiu", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app).get("/api/audit").set(comToken(token));

    expect(Object.keys(res.body.itens[0].usuario).sort()).toEqual(["id", "nome"]);
  });

  describe("filtros e paginação", () => {
    let token: string;
    let adminId: string;

    // 5 registros: login do administrador, login do gerente e três áreas.
    beforeEach(async () => {
      await criarCenarioCliente();
      const admin = await autenticar(Papel.ADMINISTRADOR);
      token = admin.token;
      adminId = admin.usuario.id;
      await autenticar(Papel.GERENTE);
      for (const nome of ["A", "B", "C"]) {
        await request(app).post("/api/areas").set(comToken(token)).send({ nome });
      }
    });

    it("filtra por usuário", async () => {
      const res = await request(app)
        .get(`/api/audit?usuarioId=${adminId}`)
        .set(comToken(token));

      expect(res.body.total).toBe(4); // 1 login + 3 áreas
      expect(res.body.itens.every((i: { usuario: { id: string } }) => i.usuario.id === adminId)).toBe(true);
    });

    it("filtra por ação", async () => {
      const res = await request(app).get("/api/audit?acao=LOGIN").set(comToken(token));
      expect(res.body.total).toBe(2);
    });

    it("recusa ação que não existe", async () => {
      const res = await request(app).get("/api/audit?acao=APAGOU_TUDO").set(comToken(token));
      expect(res.status).toBe(400);
      expect(res.body.codigo).toBe("VALIDACAO");
    });

    it("filtra por data, incluindo o dia inteiro do `ate`", async () => {
      const hoje = new Date();
      const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;

      const deHoje = await request(app).get(`/api/audit?de=${dia}&ate=${dia}`).set(comToken(token));
      const deOntem = await request(app).get("/api/audit?ate=2000-01-01").set(comToken(token));

      expect(deHoje.body.total).toBe(5);
      expect(deOntem.body.total).toBe(0);
    });

    // Mesmo cuidado do registro de ocorrências: o dia é o do restaurante.
    it("o dia do filtro é o de Brasília, não o do servidor", async () => {
      await prisma.auditLog.create({
        data: {
          acao: "LOGIN",
          usuarioId: adminId,
          entidade: "User",
          entidadeId: adminId,
          // 10/03 às 23:30 em Brasília = 11/03 às 02:30 UTC. Data passada de
          // propósito, para não cruzar com os registros de hoje do beforeEach.
          criadoEm: new Date("2026-03-11T02:30:00Z"),
        },
      });

      const doDia10 = await request(app)
        .get("/api/audit?de=2026-03-10&ate=2026-03-10")
        .set(comToken(token));
      const doDia11 = await request(app)
        .get("/api/audit?de=2026-03-11&ate=2026-03-11")
        .set(comToken(token));

      expect(doDia10.body.total).toBe(1);
      expect(doDia11.body.total).toBe(0);
    });

    it("pagina sem repetir nem pular registro", async () => {
      const vistos: string[] = [];
      for (const pagina of [1, 2, 3]) {
        const res = await request(app)
          .get(`/api/audit?porPagina=2&pagina=${pagina}`)
          .set(comToken(token));
        expect(res.body.paginas).toBe(3);
        vistos.push(...res.body.itens.map((i: { id: string }) => i.id));
      }

      expect(vistos).toHaveLength(5);
      expect(new Set(vistos).size).toBe(5);
    });

    it("recusa paginação malformada", async () => {
      const res = await request(app).get("/api/audit?porPagina=500").set(comToken(token));
      expect(res.status).toBe(400);
    });
  });
});

describe("POST /api/qrcodes", () => {
  let cenario: Cenario;

  beforeEach(async () => {
    cenario = await criarCenarioCliente();
  });

  // Era aberto desde o MVP: qualquer um na internet gravava QR Code no banco.
  it("recusa acesso sem token", async () => {
    const res = await request(app).post("/api/qrcodes").send({ areaId: cenario.area.id });

    expect(res.status).toBe(401);
    expect(await prisma.qRCode.count()).toBe(1); // só o do cenário
  });

  it.each([Papel.GERENTE, Papel.COORDENADOR])("recusa %s", async (papel) => {
    const { token } = await autenticar(papel);

    const res = await request(app)
      .post("/api/qrcodes")
      .set(comToken(token))
      .send({ areaId: cenario.area.id });

    expect(res.status).toBe(403);
  });

  it("gera para o administrador", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .post("/api/qrcodes")
      .set(comToken(token))
      .send({ areaId: cenario.area.id });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ token: expect.any(String), url: expect.stringContaining("/feedback?t=") });
    expect(res.body.imagem).toMatch(/^data:image\/png;base64,/);
  });

  // Os endpoints públicos recusam área desativada: o código nasceria sem funcionar.
  it("recusa área desativada", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);
    await prisma.area.update({ where: { id: cenario.area.id }, data: { ativo: false } });

    const res = await request(app)
      .post("/api/qrcodes")
      .set(comToken(token))
      .send({ areaId: cenario.area.id });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("AREA_INATIVA");
    expect(await prisma.auditLog.count({ where: { acao: "QRCODE_GERADO" } })).toBe(0);
  });

  it("recusa área inexistente", async () => {
    const { token } = await autenticar(Papel.ADMINISTRADOR);

    const res = await request(app)
      .post("/api/qrcodes")
      .set(comToken(token))
      .send({ areaId: "nao-existe" });

    expect(res.status).toBe(404);
  });
});
