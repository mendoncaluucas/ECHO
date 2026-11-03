import type { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";

// 404 para rota não encontrada.
export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ erro: "Rota não encontrada", codigo: "ROTA_NAO_ENCONTRADA" });
}

// Erro do leitor de JSON (body-parser, dentro do express.json). Vem com `type` e com o
// status certo, e `expose` diz que a culpa é do pedido, não da API.
interface ErroDoCorpo {
  type: string;
  status: number;
  expose: boolean;
}

function ehErroDoCorpo(err: unknown): err is ErroDoCorpo {
  const e = err as Partial<ErroDoCorpo> | null;
  return (
    typeof e?.type === "string" &&
    typeof e.status === "number" &&
    e.status >= 400 &&
    e.status < 500 &&
    e.expose === true
  );
}

// Error handler global — montar por último. Os 4 parâmetros são exigidos pelo Express.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  // Corpo que nem chega a ser lido é erro de quem mandou: 400 ou 413, e sem ir para o
  // log como "Erro não tratado" (antes era 500, com o erro inteiro no log a cada
  // pedido malformado, o que enchia o log de graça).
  if (ehErroDoCorpo(err)) {
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ erro: "O corpo do pedido não é um JSON válido", codigo: "JSON_INVALIDO" });
    }
    if (err.type === "entity.too.large") {
      return res.status(413).json({ erro: "O corpo do pedido passa de 100 kB", codigo: "CORPO_GRANDE_DEMAIS" });
    }
    // Codificação ou charset que o leitor não aceita, pedido interrompido no meio.
    return res.status(err.status).json({ erro: "Pedido inválido", codigo: "PEDIDO_INVALIDO" });
  }

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
