import { Router } from "express";
import { TipoFeedback } from "@prisma/client";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";

export const publicRoutes = Router();

const MAX_COMENTARIO = 1000;
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// GET /venue/:qrToken — contexto do formulário a partir do QR. Ver docs/CONTRATO-API.md
publicRoutes.get(
  "/venue/:qrToken",
  asyncHandler(async (req, res) => {
    const { qrToken } = req.params;

    const qr = await prisma.qRCode.findUnique({
      where: { token: qrToken },
      include: { area: { include: { venue: true } } },
    });

    if (!qr || !qr.ativo) {
      return res
        .status(404)
        .json({ erro: "QR Code inválido ou inativo", codigo: "QR_NAO_ENCONTRADO" });
    }

    const categorias = await prisma.category.findMany({
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    });

    return res.json({
      venue: { id: qr.area.venue.id, nome: qr.area.venue.nome },
      area: { id: qr.area.id, nome: qr.area.nome },
      categorias,
    });
  })
);

// POST /feedback — registra o feedback do cliente. Ver docs/CONTRATO-API.md
publicRoutes.post(
  "/feedback",
  asyncHandler(async (req, res) => {
    const { qrToken, tipo, comentario, anonimo, contatoEmail, avaliacoes } =
      req.body ?? {};

    if (typeof qrToken !== "string" || qrToken.length === 0) {
      return res.status(400).json({ erro: "qrToken é obrigatório", codigo: "VALIDACAO" });
    }
    if (!Object.values(TipoFeedback).includes(tipo)) {
      return res.status(400).json({
        erro: "tipo inválido (ELOGIO, SUGESTAO ou RECLAMACAO)",
        codigo: "VALIDACAO",
      });
    }
    if (comentario != null && (typeof comentario !== "string" || comentario.length > MAX_COMENTARIO)) {
      return res.status(400).json({
        erro: `comentário inválido (texto com no máximo ${MAX_COMENTARIO} caracteres)`,
        codigo: "VALIDACAO",
      });
    }
    if (!Array.isArray(avaliacoes) || avaliacoes.length === 0) {
      return res.status(400).json({
        erro: "avaliacoes deve conter ao menos uma categoria",
        codigo: "VALIDACAO",
      });
    }
    for (const a of avaliacoes) {
      const estrelasOk = Number.isInteger(a?.estrelas) && a.estrelas >= 1 && a.estrelas <= 5;
      if (typeof a?.categoriaId !== "string" || !estrelasOk) {
        return res.status(400).json({
          erro: "cada avaliação precisa de categoriaId e estrelas (1 a 5)",
          codigo: "VALIDACAO",
        });
      }
    }

    const ehAnonimo = typeof anonimo === "boolean" ? anonimo : true;

    // E-mail válido é exigido apenas quando o cliente se identifica.
    if (!ehAnonimo && contatoEmail != null) {
      if (typeof contatoEmail !== "string" || !EMAIL_REGEX.test(contatoEmail)) {
        return res
          .status(400)
          .json({ erro: "contatoEmail inválido", codigo: "VALIDACAO" });
      }
    }

    const qr = await prisma.qRCode.findUnique({
      where: { token: qrToken },
      include: { area: true },
    });
    if (!qr || !qr.ativo) {
      return res
        .status(404)
        .json({ erro: "QR Code inválido ou inativo", codigo: "QR_NAO_ENCONTRADO" });
    }

    const ids: string[] = avaliacoes.map((a) => a.categoriaId);
    const idsUnicos = new Set(ids);
    if (idsUnicos.size !== ids.length) {
      return res
        .status(400)
        .json({ erro: "categorias repetidas na avaliação", codigo: "VALIDACAO" });
    }
    const existentes = await prisma.category.count({
      where: { id: { in: [...idsUnicos] } },
    });
    if (existentes !== idsUnicos.size) {
      return res
        .status(400)
        .json({ erro: "alguma categoriaId não existe", codigo: "VALIDACAO" });
    }

    const feedback = await prisma.feedback.create({
      data: {
        venueId: qr.area.venueId,
        areaId: qr.area.id,
        tipo,
        comentario: typeof comentario === "string" ? comentario : null,
        anonimo: ehAnonimo,
        contatoEmail:
          !ehAnonimo && typeof contatoEmail === "string" ? contatoEmail : null,
        avaliacoes: {
          create: avaliacoes.map((a) => ({
            categoryId: a.categoriaId,
            estrelas: a.estrelas,
          })),
        },
      },
      select: { id: true, criadoEm: true },
    });

    return res.status(201).json(feedback);
  })
);
