import type { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";

// 404 para qualquer rota não encontrada.
export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ erro: "Rota não encontrada", codigo: "ROTA_NAO_ENCONTRADA" });
}

// Middleware de erro global — deve ser o ÚLTIMO a ser montado no app.
// (Precisa dos 4 parâmetros para o Express reconhecê-lo como handler de erro.)
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  // Violação de restrição única do Prisma (ex.: token de QR duplicado em corrida).
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
