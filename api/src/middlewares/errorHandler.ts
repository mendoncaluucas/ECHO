import type { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";

// 404 para rota não encontrada.
export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ erro: "Rota não encontrada", codigo: "ROTA_NAO_ENCONTRADA" });
}

// Error handler global — montar por último. Os 4 parâmetros são exigidos pelo Express.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  // Constraint única do Prisma (P2002) → 409.
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  ) {
    return res.status(409).json({ erro: "Registro já existe", codigo: "CONFLITO" });
  }

  console.error("Erro não tratado:", err);
  return res
    .status(500)
    .json({ erro: "Erro interno do servidor", codigo: "ERRO_INTERNO" });
}
