import { Router } from "express";
import { Papel, StatusOcorrencia } from "@prisma/client";
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

// GET / — lista os feedbacks recebidos. Ver docs/CONTRATO-API.md
// Sem paginação no MVP 1: o contrato não prevê. Entra no MVP 2, junto com filtros.
occurrencesRoutes.get(
  "/",
  requireAuth(PAPEIS_DA_GESTAO),
  asyncHandler(async (_req, res) => {
    const feedbacks = await prisma.feedback.findMany({
      orderBy: { criadoEm: "desc" },
      select: camposDaOcorrencia,
    });

    return res.json({ itens: feedbacks.map(formatar) });
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
