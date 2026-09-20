import { Router } from "express";
import { Papel } from "@prisma/client";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth } from "../middlewares/auth.js";

// Feedbacks para a gestão (protegido) — DONO: Victor
export const occurrencesRoutes = Router();

// GET / — lista os feedbacks recebidos (somente leitura). Ver docs/CONTRATO-API.md
// Sem paginação no MVP 1: o contrato não prevê. Entra no MVP 2, junto com filtros.
occurrencesRoutes.get(
  "/",
  requireAuth([Papel.COORDENADOR, Papel.GERENTE, Papel.ADMINISTRADOR]),
  asyncHandler(async (_req, res) => {
    const feedbacks = await prisma.feedback.findMany({
      orderBy: { criadoEm: "desc" },
      select: {
        id: true,
        tipo: true,
        comentario: true,
        anonimo: true,
        criadoEm: true,
        area: { select: { nome: true } },
        avaliacoes: {
          orderBy: { category: { nome: "asc" } },
          select: { estrelas: true, category: { select: { nome: true } } },
        },
      },
    });

    // contatoEmail fica de fora de propósito: não está no contrato e é dado pessoal (LGPD).
    const itens = feedbacks.map((feedback) => ({
      ...feedback,
      avaliacoes: feedback.avaliacoes.map((avaliacao) => ({
        categoria: avaliacao.category.nome,
        estrelas: avaliacao.estrelas,
      })),
    }));

    return res.json({ itens });
  })
);
