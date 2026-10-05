import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Papel, type TipoFeedback } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { autenticar, criarCenarioCliente } from "./helpers.js";

type Cenario = Awaited<ReturnType<typeof criarCenarioCliente>>;

const DIA = 24 * 60 * 60 * 1000;

type Opcoes = {
  tipo?: TipoFeedback;
  status?: "PENDENTE" | "EM_ANDAMENTO" | "RESOLVIDO";
  comentario?: string;
  criadoEm?: Date;
  areaId?: string | null;
  categoriaIndice?: number;
};

async function gravar(cenario: Cenario, opcoes: Opcoes = {}) {
  return prisma.feedback.create({
    data: {
      venueId: cenario.venue.id,
      areaId: opcoes.areaId === undefined ? cenario.area.id : opcoes.areaId,
      tipo: opcoes.tipo ?? "SUGESTAO",
      status: opcoes.status,
      comentario: opcoes.comentario,
      criadoEm: opcoes.criadoEm,
      anonimo: true,
      ...(opcoes.categoriaIndice !== undefined && {
        avaliacoes: {
          create: [{ categoryId: cenario.categorias[opcoes.categoriaIndice].id, estrelas: 4 }],
        },
      }),
    },
  });
}

async function buscar(token: string, query = "") {
  return request(app).get(`/api/occurrences${query}`).set("Authorization", `Bearer ${token}`);
}

describe("GET /api/occurrences — paginação", () => {
  let cenario: Cenario;

  beforeEach(async () => {
    cenario = await criarCenarioCliente();
  });

  it("devolve no máximo 20 por padrão e informa o total", async () => {
    for (let i = 0; i < 25; i++) {
      await gravar(cenario, { criadoEm: new Date(Date.now() - i * 1000) });
    }
    const { token } = await autenticar(Papel.GERENTE);

    const res = await buscar(token);

    expect(res.status).toBe(200);
    expect(res.body.itens).toHaveLength(20);
    expect(res.body).toMatchObject({ total: 25, pagina: 1, porPagina: 20, paginas: 2 });
  });

  it("a segunda página traz o resto, sem repetir item da primeira", async () => {
    for (let i = 0; i < 25; i++) {
      await gravar(cenario, { criadoEm: new Date(Date.now() - i * 1000) });
    }
    const { token } = await autenticar(Papel.GERENTE);

    const primeira = await buscar(token, "?pagina=1");
    const segunda = await buscar(token, "?pagina=2");

    expect(segunda.body.itens).toHaveLength(5);

    const idsDaPrimeira = new Set(primeira.body.itens.map((i: { id: string }) => i.id));
    const repetidos = segunda.body.itens.filter((i: { id: string }) =>
      idsDaPrimeira.has(i.id)
    );
    expect(repetidos).toEqual([]);
  });

  it("página além do fim devolve lista vazia, não erro", async () => {
    await gravar(cenario);
    const { token } = await autenticar(Papel.GERENTE);

    const res = await buscar(token, "?pagina=99");

    expect(res.status).toBe(200);
    expect(res.body.itens).toEqual([]);
    expect(res.body.total).toBe(1);
  });

  it("respeita porPagina", async () => {
    for (let i = 0; i < 5; i++) await gravar(cenario);
    const { token } = await autenticar(Papel.GERENTE);

    const res = await buscar(token, "?porPagina=2");

    expect(res.body.itens).toHaveLength(2);
    expect(res.body.paginas).toBe(3);
  });

  // Sem teto, bastaria pedir porPagina=1000000 para derrubar a resposta.
  it.each(["0", "101", "abc", "-1"])("recusa porPagina=%s", async (valor) => {
    const { token } = await autenticar(Papel.GERENTE);

    const res = await buscar(token, `?porPagina=${valor}`);

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("VALIDACAO");
  });

  it("base vazia devolve total 0 e uma página", async () => {
    const { token } = await autenticar(Papel.GERENTE);

    const res = await buscar(token);

    expect(res.body).toMatchObject({ total: 0, paginas: 1 });
    expect(res.body.itens).toEqual([]);
  });
});

describe("GET /api/occurrences — filtros", () => {
  let cenario: Cenario;

  beforeEach(async () => {
    cenario = await criarCenarioCliente();
  });

  it("filtra por status", async () => {
    await gravar(cenario, { status: "RESOLVIDO" });
    await gravar(cenario, { status: "PENDENTE" });
    const { token } = await autenticar(Papel.GERENTE);

    const res = await buscar(token, "?status=RESOLVIDO");

    expect(res.body.total).toBe(1);
    expect(res.body.itens[0].status).toBe("RESOLVIDO");
  });

  it("filtra por tipo", async () => {
    await gravar(cenario, { tipo: "ELOGIO" });
    await gravar(cenario, { tipo: "RECLAMACAO" });
    const { token } = await autenticar(Papel.GERENTE);

    const res = await buscar(token, "?tipo=ELOGIO");

    expect(res.body.total).toBe(1);
    expect(res.body.itens[0].tipo).toBe("ELOGIO");
  });

  it("filtra por categoria avaliada", async () => {
    await gravar(cenario, { categoriaIndice: 0 }); // Higiene
    await gravar(cenario, { categoriaIndice: 1 }); // Atendimento
    const { token } = await autenticar(Papel.GERENTE);

    const res = await buscar(token, "?categoria=Higiene");

    expect(res.body.total).toBe(1);
    expect(res.body.itens[0].avaliacoes[0].categoria).toBe("Higiene");
  });

  it("busca no comentário, ignorando maiúsculas", async () => {
    await gravar(cenario, { comentario: "Banheiro estava sujo" });
    await gravar(cenario, { comentario: "Comida excelente" });
    const { token } = await autenticar(Papel.GERENTE);

    const res = await buscar(token, "?busca=BANHEIRO");

    expect(res.body.total).toBe(1);
    expect(res.body.itens[0].comentario).toContain("Banheiro");
  });

  it("busca também pelo nome da área", async () => {
    const outra = await prisma.area.create({
      data: { nome: "Varanda", venueId: cenario.venue.id },
    });
    await gravar(cenario, { areaId: outra.id });
    await gravar(cenario);
    const { token } = await autenticar(Papel.GERENTE);

    const res = await buscar(token, "?busca=varanda");

    expect(res.body.total).toBe(1);
    expect(res.body.itens[0].area.nome).toBe("Varanda");
  });

  it("filtra por intervalo de datas", async () => {
    const agora = Date.now();
    await gravar(cenario, { criadoEm: new Date(agora - 10 * DIA), comentario: "antigo" });
    await gravar(cenario, { criadoEm: new Date(agora - 1 * DIA), comentario: "recente" });
    const { token } = await autenticar(Papel.GERENTE);

    const ontem = new Date(agora - 2 * DIA).toISOString().slice(0, 10);
    const res = await buscar(token, `?de=${ontem}`);

    expect(res.body.total).toBe(1);
    expect(res.body.itens[0].comentario).toBe("recente");
  });

  // "até 30/09" tem que incluir o que aconteceu durante o dia 30, não parar à meia-noite.
  it("o filtro 'ate' inclui o dia inteiro", async () => {
    const hoje = new Date();
    hoje.setHours(18, 30, 0, 0);
    await gravar(cenario, { criadoEm: hoje, comentario: "fim da tarde" });
    const { token } = await autenticar(Papel.GERENTE);

    const dia = hoje.toISOString().slice(0, 10);
    const res = await buscar(token, `?ate=${dia}`);

    expect(res.body.total).toBe(1);
  });

  // O dia do filtro é o do restaurante. Em servidor UTC (o Render), "até 05/10"
  // terminava às 20:59 de Brasília e o jantar sumia do registro e do CSV.
  it("o dia do filtro é o de Brasília, não o do servidor", async () => {
    // 05/10 às 23:30 em Brasília = 06/10 às 02:30 UTC.
    await gravar(cenario, { criadoEm: new Date("2026-10-06T02:30:00Z"), comentario: "jantar" });
    const { token } = await autenticar(Papel.GERENTE);

    const ate05 = await buscar(token, "?ate=2026-10-05");
    const de06 = await buscar(token, "?de=2026-10-06");

    expect(ate05.body.total).toBe(1);
    expect(de06.body.total).toBe(0);
  });

  it("combina filtros", async () => {
    await gravar(cenario, { tipo: "RECLAMACAO", status: "PENDENTE" });
    await gravar(cenario, { tipo: "RECLAMACAO", status: "RESOLVIDO" });
    await gravar(cenario, { tipo: "ELOGIO", status: "PENDENTE" });
    const { token } = await autenticar(Papel.GERENTE);

    const res = await buscar(token, "?tipo=RECLAMACAO&status=PENDENTE");

    expect(res.body.total).toBe(1);
  });

  it.each([
    ["status", "?status=ARQUIVADO"],
    ["tipo", "?tipo=CRITICA"],
    ["data", "?de=30-09-2026"],
  ])("recusa %s inválido", async (_caso, query) => {
    const { token } = await autenticar(Papel.GERENTE);

    const res = await buscar(token, query);

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("VALIDACAO");
  });
});
