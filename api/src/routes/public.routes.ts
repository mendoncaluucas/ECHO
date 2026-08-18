import { Router } from "express";
import { prisma } from "../prisma.js";

// Rotas públicas do cliente (sem autenticação) — DONO: Lucas
export const publicRoutes = Router();

// GET /api/public/venue/:qrToken
// Resolve o QR Code e devolve o contexto para montar o formulário.
// Contrato: docs/CONTRATO-API.md
publicRoutes.get("/venue/:qrToken", async (req, res) => {
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
});

// POST /api/public/feedback
// Grava o feedback do cliente.
// TODO (Lucas): implementar conforme docs/CONTRATO-API.md
//   body: { qrToken, tipo, comentario?, anonimo?, contatoEmail?, avaliacoes: [{ categoriaId, estrelas }] }
publicRoutes.post("/feedback", async (_req, res) => {
  return res
    .status(501)
    .json({ erro: "Ainda não implementado", codigo: "NAO_IMPLEMENTADO" });
});
