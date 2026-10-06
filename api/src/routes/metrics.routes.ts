import { Router } from "express";
import { Papel, StatusOcorrencia, TipoFeedback } from "@prisma/client";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth } from "../middlewares/auth.js";
import { lerData } from "../consulta.js";

// Métricas agregadas para o dashboard da gestão — DONO: Lucas
export const metricsRoutes = Router();

const PAPEIS_DA_GESTAO = [Papel.COORDENADOR, Papel.GERENTE, Papel.ADMINISTRADOR];

const DIAS_PADRAO = 30;
const DIAS_MAXIMO = 365;
const MS_POR_DIA = 24 * 60 * 60 * 1000;
const MS_POR_HORA = 60 * 60 * 1000;

// Feedback sem área existe no schema (areaId é opcional), então precisa de rótulo.
const SEM_AREA = "Sem área";

// ?dias=N — inteiro entre 1 e 365. Devolve null quando o valor é inválido,
// para o handler responder 400 em vez de silenciosamente cair no padrão.
function lerDias(valor: unknown): number | null {
  if (valor === undefined) return DIAS_PADRAO;
  if (typeof valor !== "string" || !/^\d+$/.test(valor)) return null;

  const dias = Number(valor);
  return dias >= 1 && dias <= DIAS_MAXIMO ? dias : null;
}

function arredondar(valor: number, casas: number) {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

// GET / — números agregados do período. Ver docs/CONTRATO-API.md
metricsRoutes.get(
  "/",
  requireAuth(PAPEIS_DA_GESTAO),
  asyncHandler(async (req, res) => {
    const dias = lerDias(req.query.dias);
    if (dias === null) {
      return res.status(400).json({
        erro: `dias deve ser um inteiro entre 1 e ${DIAS_MAXIMO}`,
        codigo: "VALIDACAO",
      });
    }

    const ate = new Date();
    const de = new Date(ate.getTime() - dias * MS_POR_DIA);
    const deAnterior = new Date(de.getTime() - dias * MS_POR_DIA);

    // Sem limite superior de propósito. O `criadoEm` é carimbado pelo banco
    // (DEFAULT CURRENT_TIMESTAMP) e o `ate` vem do relógio desta API — em produção são
    // máquinas diferentes. Com `lte: ate`, um feedback gravado milissegundos à frente
    // sumiria do dashboard até os relógios alinharem. Data futura não existe
    // legitimamente aqui, então o teto não protege de nada.
    const noPeriodo = { criadoEm: { gte: de } };

    const [
      total,
      totalAnterior,
      gruposStatus,
      gruposTipo,
      gruposArea,
      gruposCategoria,
      tratados,
      areas,
      categorias,
    ] = await Promise.all([
      prisma.feedback.count({ where: noPeriodo }),
      // Janela anterior de mesmo tamanho, colada na atual: [de - dias, de).
      prisma.feedback.count({ where: { criadoEm: { gte: deAnterior, lt: de } } }),
      prisma.feedback.groupBy({
        by: ["status"],
        where: noPeriodo,
        _count: { _all: true },
      }),
      prisma.feedback.groupBy({
        by: ["tipo"],
        where: noPeriodo,
        _count: { _all: true },
      }),
      prisma.feedback.groupBy({
        by: ["areaId"],
        where: noPeriodo,
        _count: { _all: true },
      }),
      prisma.feedbackRating.groupBy({
        by: ["categoryId"],
        where: { feedback: noPeriodo },
        _count: { _all: true },
        _avg: { estrelas: true },
      }),
      // Média de tratativa somada em JS: são duas colunas de data e o volume do MVP
      // é baixo. Se a base crescer, trocar por AVG(EXTRACT(EPOCH ...)) em SQL.
      prisma.feedback.findMany({
        where: { ...noPeriodo, tratadoEm: { not: null } },
        select: { criadoEm: true, tratadoEm: true },
      }),
      // Tabelas pequenas: buscar inteiras sai mais barato que um join por grupo.
      prisma.area.findMany({ select: { id: true, nome: true } }),
      prisma.category.findMany({ select: { id: true, nome: true } }),
    ]);

    const nomeDaArea = new Map(areas.map((area) => [area.id, area.nome]));
    const nomeDaCategoria = new Map(categorias.map((cat) => [cat.id, cat.nome]));

    const totalPorStatus = new Map(
      gruposStatus.map((grupo) => [grupo.status, grupo._count._all])
    );
    const totalPorTipo = new Map(
      gruposTipo.map((grupo) => [grupo.tipo, grupo._count._all])
    );

    // Status e tipo saem sempre com as três opções, inclusive zeradas: o gráfico e
    // os contadores do front ficam estáveis em vez de sumir quando não há registro.
    const porStatus = Object.values(StatusOcorrencia).map((status) => ({
      status,
      total: totalPorStatus.get(status) ?? 0,
    }));
    const porTipo = Object.values(TipoFeedback).map((tipo) => ({
      tipo,
      total: totalPorTipo.get(tipo) ?? 0,
    }));

    // Áreas e categorias sem registro no período ficam de fora: média 0 estrelas
    // seria lida como "nota péssima" quando o caso é "não houve avaliação".
    const porArea = gruposArea
      .map((grupo) => ({
        area: (grupo.areaId && nomeDaArea.get(grupo.areaId)) || SEM_AREA,
        total: grupo._count._all,
      }))
      .sort((a, b) => b.total - a.total || a.area.localeCompare(b.area, "pt-BR"));

    const porCategoria = gruposCategoria
      .map((grupo) => ({
        categoria: nomeDaCategoria.get(grupo.categoryId) ?? grupo.categoryId,
        total: grupo._count._all,
        mediaEstrelas: arredondar(grupo._avg.estrelas ?? 0, 1),
      }))
      .sort((a, b) => a.categoria.localeCompare(b.categoria, "pt-BR"));

    const somaDasTratativas = tratados.reduce(
      (soma, feedback) =>
        soma +
        (feedback.tratadoEm ? feedback.tratadoEm.getTime() - feedback.criadoEm.getTime() : 0),
      0
    );

    const resolvidos = totalPorStatus.get(StatusOcorrencia.RESOLVIDO) ?? 0;

    return res.json({
      periodo: { dias, de: de.toISOString(), ate: ate.toISOString() },
      resumo: {
        total,
        resolvidos,
        percentualResolvido: total === 0 ? 0 : Math.round((resolvidos / total) * 100),
        // null (e não 0) quando ninguém tratou nada ainda: o front mostra "—",
        // porque "0h" passaria a ideia de atendimento instantâneo.
        tempoMedioTratativaHoras:
          tratados.length === 0
            ? null
            : arredondar(somaDasTratativas / tratados.length / MS_POR_HORA, 1),
        // Sem base de comparação não existe variação percentual — dividir por zero
        // daria Infinity. O front mostra "—".
        variacaoPercentual:
          totalAnterior === 0
            ? null
            : Math.round(((total - totalAnterior) / totalAnterior) * 100),
      },
      porStatus,
      porTipo,
      porArea,
      porCategoria,
    });
  })
);

// ---------- Relatório histórico ----------

const MESES_PADRAO = 6;
const MESES_MAXIMO = 24;

// Mês no fuso do restaurante (o app.ts fixa America/Sao_Paulo). Um feedback das
// 23h30 do dia 31 é do mês que termina, não do seguinte — em UTC ele já seria.
function chaveDoMes(data: Date) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

function diaLocal(data: Date) {
  return `${chaveDoMes(data)}-${String(data.getDate()).padStart(2, "0")}`;
}

function media(soma: number, quantidade: number) {
  // null, e não 0: zero estrelas seria lido como nota péssima quando o caso é
  // "ninguém avaliou".
  return quantidade === 0 ? null : arredondar(soma / quantidade, 1);
}

function percentual(parte: number, total: number) {
  return total === 0 ? 0 : Math.round((parte / total) * 100);
}

type Acumulado = { soma: number; quantidade: number };

// GET /relatorio — série mês a mês e resumo por setor num intervalo explícito.
// Ver docs/CONTRATO-API.md
metricsRoutes.get(
  "/relatorio",
  requireAuth(PAPEIS_DA_GESTAO),
  asyncHandler(async (req, res) => {
    const deInformado = lerData(req.query.de);
    const ateInformado = lerData(req.query.ate, true);
    if (deInformado === null || ateInformado === null) {
      return res.status(400).json({ erro: "data deve ser YYYY-MM-DD", codigo: "VALIDACAO" });
    }

    const hoje = new Date();
    const fim =
      ateInformado ??
      new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999);
    // Padrão: os últimos 6 meses fechados até hoje, começando no dia 1 — uma série
    // que começa no meio de um mês teria o primeiro ponto artificialmente baixo.
    const inicio =
      deInformado ?? new Date(fim.getFullYear(), fim.getMonth() - (MESES_PADRAO - 1), 1);

    if (inicio > fim) {
      return res
        .status(400)
        .json({ erro: "a data inicial deve ser anterior à final", codigo: "VALIDACAO" });
    }

    const quantidadeDeMeses =
      (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth()) + 1;
    if (quantidadeDeMeses > MESES_MAXIMO) {
      return res.status(400).json({
        erro: `o intervalo pode ter no máximo ${MESES_MAXIMO} meses`,
        codigo: "VALIDACAO",
      });
    }

    // Período anterior de mesmo tamanho, colado no atual, para a comparação.
    const duracao = fim.getTime() - inicio.getTime() + 1;
    const inicioAnterior = new Date(inicio.getTime() - duracao);

    const [feedbacks, gruposAnteriores, areas, categorias] = await Promise.all([
      // Agregação em JS, como no tempo de tratativa acima: o mês precisa ser o do fuso
      // do restaurante, e o volume do MVP é baixo. Com a base grande, trocar por
      // date_trunc('month', "criadoEm" AT TIME ZONE 'America/Sao_Paulo') em SQL.
      prisma.feedback.findMany({
        where: { criadoEm: { gte: inicio, lte: fim } },
        select: {
          criadoEm: true,
          tipo: true,
          status: true,
          areaId: true,
          avaliacoes: { select: { categoryId: true, estrelas: true } },
        },
      }),
      prisma.feedbackRating.groupBy({
        by: ["categoryId"],
        where: { feedback: { criadoEm: { gte: inicioAnterior, lt: inicio } } },
        _avg: { estrelas: true },
      }),
      prisma.area.findMany({ select: { id: true, nome: true } }),
      prisma.category.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    ]);

    const nomeDaArea = new Map(areas.map((area) => [area.id, area.nome]));

    // Todos os meses do intervalo, inclusive os sem feedback: um mês vazio é
    // informação ("não veio nada"), e pular o ponto deixaria o gráfico mentindo.
    const meses = new Map<
      string,
      { total: number; porTipo: Record<TipoFeedback, number>; categorias: Map<string, Acumulado> }
    >();
    for (let i = 0; i < quantidadeDeMeses; i++) {
      const mes = new Date(inicio.getFullYear(), inicio.getMonth() + i, 1);
      meses.set(chaveDoMes(mes), {
        total: 0,
        porTipo: { ELOGIO: 0, SUGESTAO: 0, RECLAMACAO: 0 },
        categorias: new Map(categorias.map((c) => [c.id, { soma: 0, quantidade: 0 }])),
      });
    }

    const porArea = new Map<string, Record<StatusOcorrencia, number>>();
    const noPeriodo = new Map(categorias.map((c) => [c.id, { soma: 0, quantidade: 0 }]));
    const porStatus: Record<StatusOcorrencia, number> = {
      PENDENTE: 0,
      EM_ANDAMENTO: 0,
      RESOLVIDO: 0,
    };

    for (const feedback of feedbacks) {
      const mes = meses.get(chaveDoMes(feedback.criadoEm));
      if (mes) {
        mes.total++;
        mes.porTipo[feedback.tipo]++;
      }

      porStatus[feedback.status]++;

      const area = (feedback.areaId && nomeDaArea.get(feedback.areaId)) || SEM_AREA;
      const contagem = porArea.get(area) ?? { PENDENTE: 0, EM_ANDAMENTO: 0, RESOLVIDO: 0 };
      contagem[feedback.status]++;
      porArea.set(area, contagem);

      for (const avaliacao of feedback.avaliacoes) {
        for (const acumulado of [
          mes?.categorias.get(avaliacao.categoryId),
          noPeriodo.get(avaliacao.categoryId),
        ]) {
          if (!acumulado) continue;
          acumulado.soma += avaliacao.estrelas;
          acumulado.quantidade++;
        }
      }
    }

    const mediaAnterior = new Map(
      gruposAnteriores.map((g) => [g.categoryId, g._avg.estrelas ?? null])
    );

    return res.json({
      periodo: { de: diaLocal(inicio), ate: diaLocal(fim) },
      resumo: {
        total: feedbacks.length,
        pendentes: porStatus.PENDENTE,
        emAndamento: porStatus.EM_ANDAMENTO,
        resolvidos: porStatus.RESOLVIDO,
        percentualResolvido: percentual(porStatus.RESOLVIDO, feedbacks.length),
      },
      meses: [...meses.entries()].map(([mes, dados]) => ({
        mes,
        total: dados.total,
        porTipo: dados.porTipo,
        categorias: categorias.map((c) => {
          const acumulado = dados.categorias.get(c.id)!;
          return {
            categoria: c.nome,
            avaliacoes: acumulado.quantidade,
            mediaEstrelas: media(acumulado.soma, acumulado.quantidade),
          };
        }),
      })),
      porArea: [...porArea.entries()]
        .map(([area, contagem]) => {
          const total = contagem.PENDENTE + contagem.EM_ANDAMENTO + contagem.RESOLVIDO;
          return {
            area,
            total,
            pendentes: contagem.PENDENTE,
            emAndamento: contagem.EM_ANDAMENTO,
            resolvidos: contagem.RESOLVIDO,
            percentualResolvido: percentual(contagem.RESOLVIDO, total),
          };
        })
        .sort((a, b) => b.total - a.total || a.area.localeCompare(b.area, "pt-BR")),
      porCategoria: categorias.map((c) => {
        const acumulado = noPeriodo.get(c.id)!;
        const anterior = mediaAnterior.get(c.id);
        return {
          categoria: c.nome,
          avaliacoes: acumulado.quantidade,
          mediaEstrelas: media(acumulado.soma, acumulado.quantidade),
          mediaAnterior: anterior === undefined || anterior === null ? null : arredondar(anterior, 1),
        };
      }),
    });
  })
);
