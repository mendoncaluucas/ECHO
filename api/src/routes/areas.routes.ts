import { Router } from "express";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";

// Áreas do restaurante — alimenta a tela de geração de QR Code.
// TODO: exigir RBAC junto com POST /qrcodes quando a tela administrativa for fechada.
export const areasRoutes = Router();

// GET / — lista as áreas cadastradas. Ver docs/CONTRATO-API.md
areasRoutes.get(
  "/",
  asyncHandler(async (_req, res) => {
    const itens = await prisma.area.findMany({
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, venue: { select: { nome: true } } },
    });

    return res.json({ itens });
  })
);
