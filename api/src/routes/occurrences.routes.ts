import { Router } from "express";
import { Papel, Prisma, StatusOcorrencia, TipoFeedback } from "@prisma/client";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth } from "../middlewares/auth.js";

// Feedbacks para a gestão (protegido) — DONO: Victor
export const occurrencesRoutes = Router();

const PAPEIS_DA_GESTAO = [Papel.COORDENADOR, Papel.GERENTE, Papel.ADMINISTRADOR];

// contatoEmail fica de fora de propósito: não está no contrato e é dado pessoal (LGPD).
const camposDaOcorrencia = {
  id: true,
  tipo: true,
  comentario: true,
  anonimo: true,
  criadoEm: true,
  status: true,
  tratadoEm: true,
  area: { select: { nome: true } },
  tratadoPor: { select: { nome: true } },
  avaliacoes: {
    orderBy: { category: { nome: "asc" } },
    select: { estrelas: true, category: { select: { nome: true } } },
  },
} as const;

type OcorrenciaBruta = {
  avaliacoes: { estrelas: number; category: { nome: string } }[];
};

// Achata a avaliação para o formato do contrato: { categoria, estrelas }.
function formatar<T extends OcorrenciaBruta>(ocorrencia: T) {
  return {
    ...ocorrencia,
    avaliacoes: ocorrencia.avaliacoes.map((avaliacao) => ({
      categoria: avaliacao.category.nome,
      estrelas: avaliacao.estrelas,
    })),
  };
}

const POR_PAGINA_PADRAO = 20;
const POR_PAGINA_MAXIMO = 100;

function lerInteiro(valor: unknown, padrao: number, minimo: number, maximo: number) {
  if (valor === undefined) return padrao;
  if (typeof valor !== "string" || !/^\d+$/.test(valor)) return null;

  const numero = Number(valor);
  return numero >= minimo && numero <= maximo ? numero : null;
}

// Aceita uma data no formato YYYY-MM-DD. `fimDoDia` empurra para o último instante,
// senão filtrar "até 30/09" excluiria tudo que aconteceu durante o dia 30.
function lerData(valor: unknown, fimDoDia = false): Date | null | undefined {
  if (valor === undefined || valor === "") return undefined;
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;

  const data = new Date(`${valor}T${fimDoDia ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(data.getTime()) ? null : data;
}

function textoDoFiltro(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.trim().length > 0 ? valor.trim() : undefined;
}

// GET / — lista os feedbacks recebidos, paginados e filtrados. Ver docs/CONTRATO-API.md
occurrencesRoutes.get(
  "/",
  requireAuth(PAPEIS_DA_GESTAO),
  asyncHandler(async (req, res) => {
    const pagina = lerInteiro(req.query.pagina, 1, 1, Number.MAX_SAFE_INTEGER);
    const porPagina = lerInteiro(
      req.query.porPagina,
      POR_PAGINA_PADRAO,
      1,
      POR_PAGINA_MAXIMO
    );

    if (pagina === null || porPagina === null) {
      return res.status(400).json({
        erro: `pagina deve ser inteiro positivo e porPagina um inteiro de 1 a ${POR_PAGINA_MAXIMO}`,
        codigo: "VALIDACAO",
      });
    }

    const { status, tipo } = req.query;
    if (status !== undefined && !Object.values(StatusOcorrencia).includes(status as never)) {
      return res.status(400).json({ erro: "status inválido", codigo: "VALIDACAO" });
    }
    if (tipo !== undefined && !Object.values(TipoFeedback).includes(tipo as never)) {
      return res.status(400).json({ erro: "tipo inválido", codigo: "VALIDACAO" });
    }

    const de = lerData(req.query.de);
    const ate = lerData(req.query.ate, true);
    if (de === null || ate === null) {
      return res.status(400).json({ erro: "data deve ser YYYY-MM-DD", codigo: "VALIDACAO" });
    }

    const categoria = textoDoFiltro(req.query.categoria);
    const busca = textoDoFiltro(req.query.busca);

    const where: Prisma.FeedbackWhereInput = {
      ...(status !== undefined && { status: status as StatusOcorrencia }),
      ...(tipo !== undefined && { tipo: tipo as TipoFeedback }),
      ...((de || ate) && { criadoEm: { ...(de && { gte: de }), ...(ate && { lte: ate }) } }),
      // Categoria é por avaliação: traz quem pontuou aquela categoria.
      ...(categoria && {
        avaliacoes: { some: { category: { nome: { equals: categoria, mode: "insensitive" } } } },
      }),
      // A busca cobre o comentário e o nome da área, que é o que a tela expõe.
      ...(busca && {
        OR: [
          { comentario: { contains: busca, mode: "insensitive" } },
          { area: { nome: { contains: busca, mode: "insensitive" } } },
        ],
      }),
    };

    const [total, feedbacks] = await Promise.all([
      prisma.feedback.count({ where }),
      prisma.feedback.findMany({
        where,
        orderBy: { criadoEm: "desc" },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        select: camposDaOcorrencia,
      }),
    ]);

    return res.json({
      itens: feedbacks.map(formatar),
      total,
      pagina,
      porPagina,
      paginas: Math.max(1, Math.ceil(total / porPagina)),
    });
  })
);

// GET /:id — detalhe de uma ocorrência. Ver docs/CONTRATO-API.md
occurrencesRoutes.get(
  "/:id",
  requireAuth(PAPEIS_DA_GESTAO),
  asyncHandler(async (req, res) => {
    const ocorrencia = await prisma.feedback.findUnique({
      where: { id: req.params.id },
      select: camposDaOcorrencia,
    });

    if (!ocorrencia) {
      return res
        .status(404)
        .json({ erro: "Ocorrência não encontrada", codigo: "OCORRENCIA_NAO_ENCONTRADA" });
    }

    return res.json(formatar(ocorrencia));
  })
);

// PATCH /:id — muda o status da ocorrência. Ver docs/CONTRATO-API.md
occurrencesRoutes.patch(
  "/:id",
  requireAuth(PAPEIS_DA_GESTAO),
  asyncHandler(async (req, res) => {
    const { status } = req.body ?? {};

    if (!Object.values(StatusOcorrencia).includes(status)) {
      return res.status(400).json({
        erro: "status inválido (PENDENTE, EM_ANDAMENTO ou RESOLVIDO)",
        codigo: "VALIDACAO",
      });
    }

    const existe = await prisma.feedback.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!existe) {
      return res
        .status(404)
        .json({ erro: "Ocorrência não encontrada", codigo: "OCORRENCIA_NAO_ENCONTRADA" });
    }

    // Registra quem tratou a partir do token, nunca do corpo da requisição.
    const atualizada = await prisma.feedback.update({
      where: { id: req.params.id },
      data: {
        status,
        tratadoPorId: req.usuario?.sub,
        tratadoEm: new Date(),
      },
      select: camposDaOcorrencia,
    });

    return res.json(formatar(atualizada));
  })
);
