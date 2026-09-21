import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Papel, type TipoFeedback } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { autenticar, criarCenarioCliente } from "./helpers.js";

type Cenario = Awaited<ReturnType<typeof criarCenarioCliente>>;

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

function diasAtras(dias: number) {
  return new Date(Date.now() - dias * DIA);
}

type OpcoesFeedback = {
  tipo?: TipoFeedback;
  criadoEm?: Date;
  tratadoEm?: Date;
  status?: "PENDENTE" | "EM_ANDAMENTO" | "RESOLVIDO";
  areaId?: string | null;
  avaliacoes?: { categoriaIndice: number; estrelas: number }[];
};

async function gravarFeedback(cenario: Cenario, opcoes: OpcoesFeedback = {}) {
  const { avaliacoes = [], areaId, ...resto } = opcoes;

  return prisma.feedback.create({
    data: {
      venueId: cenario.venue.id,
      areaId: areaId === undefined ? cenario.area.id : areaId,
      tipo: resto.tipo ?? "SUGESTAO",
      anonimo: true,
      criadoEm: resto.criadoEm,
      tratadoEm: resto.tratadoEm,
      status: resto.status,
      avaliacoes: {
        create: avaliacoes.map((avaliacao) => ({
          categoryId: cenario.categorias[avaliacao.categoriaIndice].id,
          estrelas: avaliacao.estrelas,
        })),
      },
    },
  });
}

async function buscarMetricas(token: string, query = "") {
  return request(app).get(`/api/metrics${query}`).set("Authorization", `Bearer ${token}`);
}

describe("GET /api/metrics", () => {
  let cenario: Cenario;

  beforeEach(async () => {
    cenario = await criarCenarioCliente();
  });

  describe("acesso", () => {
    it("recusa acesso sem token", async () => {
      const res = await request(app).get("/api/metrics");

      expect(res.status).toBe(401);
    });

    it("libera para os papéis da gestão", async () => {
      for (const papel of [Papel.GERENTE, Papel.COORDENADOR, Papel.ADMINISTRADOR]) {
        const { token } = await autenticar(papel);

        const res = await buscarMetricas(token);

        expect(res.status).toBe(200);
      }
    });
  });

  describe("validação do período", () => {
    it.each(["0", "366", "-5", "abc", "7.5", ""])(
      "recusa dias=%s",
      async (valor) => {
        const { token } = await autenticar(Papel.GERENTE);

        const res = await buscarMetricas(token, `?dias=${valor}`);

        expect(res.status).toBe(400);
        expect(res.body.codigo).toBe("VALIDACAO");
      }
    );

    it("usa 30 dias quando o parâmetro não vem", async () => {
      const { token } = await autenticar(Papel.GERENTE);

      const res = await buscarMetricas(token);

      expect(res.body.periodo.dias).toBe(30);
    });

    it("aceita o período informado", async () => {
      const { token } = await autenticar(Papel.GERENTE);

      const res = await buscarMetricas(token, "?dias=7");

      expect(res.body.periodo.dias).toBe(7);
    });
  });

  describe("base sem feedback", () => {
    it("devolve zeros sem quebrar em divisão por zero", async () => {
      const { token } = await autenticar(Papel.GERENTE);

      const res = await buscarMetricas(token);

      expect(res.status).toBe(200);
      expect(res.body.resumo).toEqual({
        total: 0,
        resolvidos: 0,
        percentualResolvido: 0,
        tempoMedioTratativaHoras: null,
        variacaoPercentual: null,
      });
      expect(res.body.porArea).toEqual([]);
      expect(res.body.porCategoria).toEqual([]);
    });

    it("ainda lista os três status e os três tipos, zerados", async () => {
      const { token } = await autenticar(Papel.GERENTE);

      const res = await buscarMetricas(token);

      expect(res.body.porStatus).toHaveLength(3);
      expect(res.body.porTipo).toHaveLength(3);
      expect(res.body.porStatus.every((item: { total: number }) => item.total === 0)).toBe(
        true
      );
      expect(res.body.porTipo.every((item: { total: number }) => item.total === 0)).toBe(
        true
      );
    });
  });

  describe("agregações", () => {
    it("conta os feedbacks por tipo", async () => {
      await gravarFeedback(cenario, { tipo: "ELOGIO" });
      await gravarFeedback(cenario, { tipo: "ELOGIO" });
      await gravarFeedback(cenario, { tipo: "RECLAMACAO" });
      const { token } = await autenticar(Papel.GERENTE);

      const res = await buscarMetricas(token);

      expect(res.body.resumo.total).toBe(3);
      expect(res.body.porTipo).toEqual(
        expect.arrayContaining([
          { tipo: "ELOGIO", total: 2 },
          { tipo: "RECLAMACAO", total: 1 },
          { tipo: "SUGESTAO", total: 0 },
        ])
      );
    });

    it("conta por área e ordena da mais movimentada para a menos", async () => {
      const outraArea = await prisma.area.create({
        data: { nome: "Salão", venueId: cenario.venue.id },
      });
      await gravarFeedback(cenario);
      await gravarFeedback(cenario);
      await gravarFeedback(cenario, { areaId: outraArea.id });
      const { token } = await autenticar(Papel.GERENTE);

      const res = await buscarMetricas(token);

      expect(res.body.porArea).toEqual([
        { area: "Mesa 1", total: 2 },
        { area: "Salão", total: 1 },
      ]);
    });

    it("agrupa feedback sem área sob 'Sem área'", async () => {
      await gravarFeedback(cenario, { areaId: null });
      const { token } = await autenticar(Papel.GERENTE);

      const res = await buscarMetricas(token);

      expect(res.body.porArea).toEqual([{ area: "Sem área", total: 1 }]);
    });

    it("calcula a média de estrelas por categoria", async () => {
      // Higiene: 2 e 5 → média 3.5. Atendimento: só 4.
      await gravarFeedback(cenario, {
        avaliacoes: [
          { categoriaIndice: 0, estrelas: 2 },
          { categoriaIndice: 1, estrelas: 4 },
        ],
      });
      await gravarFeedback(cenario, { avaliacoes: [{ categoriaIndice: 0, estrelas: 5 }] });
      const { token } = await autenticar(Papel.GERENTE);

      const res = await buscarMetricas(token);

      expect(res.body.porCategoria).toEqual([
        { categoria: "Atendimento", total: 1, mediaEstrelas: 4 },
        { categoria: "Higiene", total: 2, mediaEstrelas: 3.5 },
      ]);
    });

    // Categoria sem avaliação nenhuma não pode aparecer com média 0: 0 estrela é
    // "nota péssima", não "sem dado".
    it("deixa de fora a categoria que ninguém avaliou", async () => {
      await gravarFeedback(cenario, { avaliacoes: [{ categoriaIndice: 0, estrelas: 3 }] });
      const { token } = await autenticar(Papel.GERENTE);

      const res = await buscarMetricas(token);

      expect(res.body.porCategoria).toEqual([
        { categoria: "Higiene", total: 1, mediaEstrelas: 3 },
      ]);
    });

    it("calcula o percentual de resolvidos", async () => {
      await gravarFeedback(cenario, { status: "RESOLVIDO" });
      await gravarFeedback(cenario, { status: "PENDENTE" });
      await gravarFeedback(cenario, { status: "PENDENTE" });
      await gravarFeedback(cenario, { status: "EM_ANDAMENTO" });
      const { token } = await autenticar(Papel.GERENTE);

      const res = await buscarMetricas(token);

      expect(res.body.resumo.resolvidos).toBe(1);
      expect(res.body.resumo.percentualResolvido).toBe(25);
    });
  });

  describe("tempo médio de tratativa", () => {
    it("mede de criadoEm até tratadoEm, em horas", async () => {
      const agora = Date.now();
      // 2h e 4h → média 3h.
      await gravarFeedback(cenario, {
        criadoEm: new Date(agora - 10 * HORA),
        tratadoEm: new Date(agora - 8 * HORA),
        status: "RESOLVIDO",
      });
      await gravarFeedback(cenario, {
        criadoEm: new Date(agora - 10 * HORA),
        tratadoEm: new Date(agora - 6 * HORA),
        status: "RESOLVIDO",
      });
      const { token } = await autenticar(Papel.GERENTE);

      const res = await buscarMetricas(token);

      expect(res.body.resumo.tempoMedioTratativaHoras).toBe(3);
    });

    it("ignora quem ainda não foi tratado", async () => {
      const agora = Date.now();
      await gravarFeedback(cenario, {
        criadoEm: new Date(agora - 5 * HORA),
        tratadoEm: new Date(agora - 3 * HORA),
        status: "RESOLVIDO",
      });
      await gravarFeedback(cenario, { criadoEm: new Date(agora - 100 * HORA) });
      const { token } = await autenticar(Papel.GERENTE);

      const res = await buscarMetricas(token);

      expect(res.body.resumo.tempoMedioTratativaHoras).toBe(2);
    });
  });

  describe("janela de tempo", () => {
    it("ignora feedback anterior ao período", async () => {
      await gravarFeedback(cenario, { criadoEm: diasAtras(2) });
      await gravarFeedback(cenario, { criadoEm: diasAtras(40) });
      const { token } = await autenticar(Papel.GERENTE);

      const res = await buscarMetricas(token, "?dias=7");

      expect(res.body.resumo.total).toBe(1);
    });

    it("compara com a janela anterior de mesmo tamanho", async () => {
      // dias=10 → atual [-10d, hoje], anterior [-20d, -10d).
      await gravarFeedback(cenario, { criadoEm: diasAtras(1) });
      await gravarFeedback(cenario, { criadoEm: diasAtras(2) });
      await gravarFeedback(cenario, { criadoEm: diasAtras(3) });
      await gravarFeedback(cenario, { criadoEm: diasAtras(15) });
      await gravarFeedback(cenario, { criadoEm: diasAtras(16) });
      const { token } = await autenticar(Papel.GERENTE);

      const res = await buscarMetricas(token, "?dias=10");

      // 3 agora contra 2 antes = +50%.
      expect(res.body.resumo.total).toBe(3);
      expect(res.body.resumo.variacaoPercentual).toBe(50);
    });

    it("devolve variação nula quando não havia nada no período anterior", async () => {
      await gravarFeedback(cenario, { criadoEm: diasAtras(1) });
      const { token } = await autenticar(Papel.GERENTE);

      const res = await buscarMetricas(token, "?dias=10");

      expect(res.body.resumo.variacaoPercentual).toBeNull();
    });

    it("aceita variação negativa quando o volume caiu", async () => {
      await gravarFeedback(cenario, { criadoEm: diasAtras(1) });
      await gravarFeedback(cenario, { criadoEm: diasAtras(15) });
      await gravarFeedback(cenario, { criadoEm: diasAtras(16) });
      await gravarFeedback(cenario, { criadoEm: diasAtras(17) });
      await gravarFeedback(cenario, { criadoEm: diasAtras(18) });
      const { token } = await autenticar(Papel.GERENTE);

      const res = await buscarMetricas(token, "?dias=10");

      // 1 agora contra 4 antes = -75%.
      expect(res.body.resumo.variacaoPercentual).toBe(-75);
    });
  });
});
