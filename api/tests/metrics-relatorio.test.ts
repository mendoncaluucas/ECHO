import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Papel, type StatusOcorrencia, type TipoFeedback } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { autenticar, criarCenarioCliente } from "./helpers.js";

type Cenario = Awaited<ReturnType<typeof criarCenarioCliente>>;

// helpers.CATEGORIAS = ["Higiene", "Atendimento", "Alimento"]
const HIGIENE = 0;
const ATENDIMENTO = 1;

type Opcoes = {
  criadoEm: Date;
  tipo?: TipoFeedback;
  status?: StatusOcorrencia;
  areaId?: string | null;
  notas?: [indice: number, estrelas: number][];
};

async function gravar(cenario: Cenario, opcoes: Opcoes) {
  return prisma.feedback.create({
    data: {
      venueId: cenario.venue.id,
      areaId: opcoes.areaId === undefined ? cenario.area.id : opcoes.areaId,
      tipo: opcoes.tipo ?? "SUGESTAO",
      status: opcoes.status,
      criadoEm: opcoes.criadoEm,
      avaliacoes: {
        create: (opcoes.notas ?? []).map(([indice, estrelas]) => ({
          categoryId: cenario.categorias[indice].id,
          estrelas,
        })),
      },
    },
  });
}

// Meio do dia em Brasília, longe de qualquer virada de mês.
function emBrasilia(dia: string, hora = "12:00") {
  return new Date(`${dia}T${hora}:00-03:00`);
}

async function relatorio(token: string, query = "") {
  return request(app)
    .get(`/api/metrics/relatorio${query}`)
    .set("Authorization", `Bearer ${token}`);
}

type Mes = {
  mes: string;
  total: number;
  porTipo: Record<TipoFeedback, number>;
  categorias: { categoria: string; avaliacoes: number; mediaEstrelas: number | null }[];
};

function categoriaDoMes(mes: Mes, nome: string) {
  return mes.categorias.find((c) => c.categoria === nome)!;
}

describe("GET /api/metrics/relatorio", () => {
  let cenario: Cenario;
  let token: string;

  beforeEach(async () => {
    cenario = await criarCenarioCliente();
    token = (await autenticar(Papel.GERENTE)).token;
  });

  it("recusa acesso sem token", async () => {
    const res = await request(app).get("/api/metrics/relatorio");
    expect(res.status).toBe(401);
  });

  it("sem datas, cobre os últimos 6 meses a partir do dia 1", async () => {
    const res = await relatorio(token);

    expect(res.status).toBe(200);
    expect(res.body.meses).toHaveLength(6);
    expect(res.body.periodo.de).toMatch(/-01$/);

    const hoje = new Date();
    const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
    expect(res.body.meses.at(-1).mes).toBe(mesAtual);
  });

  // Mês vazio é informação. Pular o ponto deixaria o gráfico ligando março a maio
  // como se abril não tivesse existido.
  it("traz todos os meses do intervalo, inclusive os vazios", async () => {
    await gravar(cenario, { criadoEm: emBrasilia("2026-03-10") });
    await gravar(cenario, { criadoEm: emBrasilia("2026-05-10") });

    const res = await relatorio(token, "?de=2026-03-01&ate=2026-05-31");

    expect(res.body.meses.map((m: Mes) => [m.mes, m.total])).toEqual([
      ["2026-03", 1],
      ["2026-04", 0],
      ["2026-05", 1],
    ]);
    const abril = res.body.meses[1] as Mes;
    expect(categoriaDoMes(abril, "Higiene")).toEqual({
      categoria: "Higiene",
      avaliacoes: 0,
      mediaEstrelas: null,
    });
  });

  it("separa os tipos e calcula a nota média de cada categoria no mês", async () => {
    await gravar(cenario, {
      criadoEm: emBrasilia("2026-04-05"),
      tipo: "RECLAMACAO",
      notas: [[HIGIENE, 1], [ATENDIMENTO, 3]],
    });
    await gravar(cenario, {
      criadoEm: emBrasilia("2026-04-20"),
      tipo: "ELOGIO",
      notas: [[HIGIENE, 4]],
    });

    const res = await relatorio(token, "?de=2026-04-01&ate=2026-04-30");
    const abril = res.body.meses[0] as Mes;

    expect(abril.porTipo).toEqual({ ELOGIO: 1, SUGESTAO: 0, RECLAMACAO: 1 });
    expect(categoriaDoMes(abril, "Higiene")).toMatchObject({ avaliacoes: 2, mediaEstrelas: 2.5 });
    expect(categoriaDoMes(abril, "Atendimento")).toMatchObject({ avaliacoes: 1, mediaEstrelas: 3 });
  });

  // O mês é o do restaurante. Em UTC, o jantar do dia 31 já seria do mês seguinte.
  it("o feedback das 23h30 do último dia fica no mês dele", async () => {
    // 31/03 às 23:30 em Brasília = 01/04 às 02:30 UTC.
    await gravar(cenario, { criadoEm: new Date("2026-04-01T02:30:00Z") });

    const res = await relatorio(token, "?de=2026-03-01&ate=2026-04-30");

    expect(res.body.meses.map((m: Mes) => [m.mes, m.total])).toEqual([
      ["2026-03", 1],
      ["2026-04", 0],
    ]);
  });

  it("quebra cada setor por status, com a taxa de resolução", async () => {
    const varanda = await prisma.area.create({
      data: { nome: "Varanda", venueId: cenario.venue.id },
    });
    const dia = emBrasilia("2026-04-10");
    await gravar(cenario, { criadoEm: dia, status: "RESOLVIDO" });
    await gravar(cenario, { criadoEm: dia, status: "RESOLVIDO" });
    await gravar(cenario, { criadoEm: dia, status: "PENDENTE" });
    await gravar(cenario, { criadoEm: dia, status: "EM_ANDAMENTO" });
    await gravar(cenario, { criadoEm: dia, areaId: varanda.id, status: "PENDENTE" });

    const res = await relatorio(token, "?de=2026-04-01&ate=2026-04-30");

    expect(res.body.porArea).toEqual([
      {
        area: "Mesa 1",
        total: 4,
        pendentes: 1,
        emAndamento: 1,
        resolvidos: 2,
        percentualResolvido: 50,
      },
      {
        area: "Varanda",
        total: 1,
        pendentes: 1,
        emAndamento: 0,
        resolvidos: 0,
        percentualResolvido: 0,
      },
    ]);
    expect(res.body.resumo).toEqual({
      total: 5,
      pendentes: 2,
      emAndamento: 1,
      resolvidos: 2,
      percentualResolvido: 40,
    });
  });

  it("compara a nota de cada categoria com o período anterior de mesmo tamanho", async () => {
    // Período pedido: abril (30 dias). O anterior é março, os 30 dias colados antes.
    await gravar(cenario, { criadoEm: emBrasilia("2026-03-15"), notas: [[HIGIENE, 2]] });
    await gravar(cenario, { criadoEm: emBrasilia("2026-04-15"), notas: [[HIGIENE, 4]] });
    // Fora dos dois períodos: não pode entrar em nenhuma média.
    await gravar(cenario, { criadoEm: emBrasilia("2026-01-15"), notas: [[HIGIENE, 1]] });

    const res = await relatorio(token, "?de=2026-04-01&ate=2026-04-30");
    const higiene = res.body.porCategoria.find(
      (c: { categoria: string }) => c.categoria === "Higiene"
    );
    const atendimento = res.body.porCategoria.find(
      (c: { categoria: string }) => c.categoria === "Atendimento"
    );

    expect(higiene).toEqual({
      categoria: "Higiene",
      avaliacoes: 1,
      mediaEstrelas: 4,
      mediaAnterior: 2,
    });
    // Sem avaliação, nem agora nem antes: null, nunca 0.
    expect(atendimento).toMatchObject({ mediaEstrelas: null, mediaAnterior: null });
  });

  it("a data final inclui o dia inteiro", async () => {
    await gravar(cenario, { criadoEm: emBrasilia("2026-04-30", "22:45") });

    const res = await relatorio(token, "?de=2026-04-01&ate=2026-04-30");

    expect(res.body.resumo.total).toBe(1);
  });

  it("recusa data malformada", async () => {
    const res = await relatorio(token, "?de=01/04/2026");
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("VALIDACAO");
  });

  // O JavaScript rolaria 31/02 para 03/03 em silêncio, e o relatório sairia com um
  // período diferente do pedido.
  it.each(["2026-02-31", "2026-02-29", "2026-04-31"])(
    "recusa data que não existe no calendário (%s)",
    async (dia) => {
      const res = await relatorio(token, `?de=2026-01-01&ate=${dia}`);
      expect(res.status).toBe(400);
    }
  );

  it("aceita 29 de fevereiro em ano bissexto", async () => {
    const res = await relatorio(token, "?de=2028-01-01&ate=2028-02-29");
    expect(res.status).toBe(200);
  });

  it("recusa intervalo invertido", async () => {
    const res = await relatorio(token, "?de=2026-05-01&ate=2026-04-01");
    expect(res.status).toBe(400);
  });

  // Teto para uma requisição não conseguir varrer a base inteira.
  it("recusa intervalo maior que 24 meses", async () => {
    const dentro = await relatorio(token, "?de=2025-01-01&ate=2026-12-31");
    const fora = await relatorio(token, "?de=2024-12-01&ate=2026-12-31");

    expect(dentro.status).toBe(200);
    expect(fora.status).toBe(400);
  });
});
