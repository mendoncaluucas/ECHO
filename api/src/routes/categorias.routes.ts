import { Router } from "express";
import { Papel } from "@prisma/client";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth } from "../middlewares/auth.js";

// Categorias de avaliação (Alimento, Atendimento, Higiene...) para os filtros da gestão.
// O cliente recebe as dele pelo endpoint público do QR Code.
export const categoriasRoutes = Router();

const PAPEIS_DA_GESTAO = [Papel.COORDENADOR, Papel.GERENTE, Papel.ADMINISTRADOR];

// GET / — lista as categorias. Ver docs/CONTRATO-API.md
//
// Os filtros montavam a lista a partir das ocorrências já carregadas, ou a tinham
// escrita no código: uma categoria nova no banco não aparecia, ou a filtragem pelo
// servidor ficava sem opções.
categoriasRoutes.get(
  "/",
  requireAuth(PAPEIS_DA_GESTAO),
  asyncHandler(async (_req, res) => {
    const itens = await prisma.category.findMany({
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    });
    return res.json({ itens });
  })
);
