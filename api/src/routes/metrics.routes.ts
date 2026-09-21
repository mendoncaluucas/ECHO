import { Router } from "express";
import { Papel, StatusOcorrencia, TipoFeedback } from "@prisma/client";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth } from "../middlewares/auth.js";

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

    const noPeriodo = { criadoEm: { gte: de, lte: ate } };

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
