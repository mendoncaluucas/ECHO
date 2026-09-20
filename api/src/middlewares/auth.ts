import type { Request, Response, NextFunction } from "express";
import type { Papel } from "@prisma/client";
import { verificarToken, type PayloadToken } from "../jwt.js";

// Disponibiliza req.usuario nos handlers que rodam depois do requireAuth.
declare module "express-serve-static-core" {
  interface Request {
    usuario?: PayloadToken;
  }
}

// Middleware de autenticação/autorização (RBAC) — DONO: Victor
//
// Uso:
//   router.get("/", requireAuth([Papel.GERENTE, Papel.ADMINISTRADOR]), handler)
//
// Lista vazia exige apenas estar autenticado, sem restrição de papel.
export function requireAuth(papeisPermitidos: Papel[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const [esquema, token] = (req.headers.authorization ?? "").split(" ");

    if (esquema !== "Bearer" || !token) {
      return res
        .status(401)
        .json({ erro: "Token não informado", codigo: "NAO_AUTENTICADO" });
    }

    let usuario: PayloadToken;
    try {
      usuario = verificarToken(token);
    } catch {
      return res
        .status(401)
        .json({ erro: "Token inválido ou expirado", codigo: "TOKEN_INVALIDO" });
    }

    if (papeisPermitidos.length > 0 && !papeisPermitidos.includes(usuario.papel)) {
      return res
        .status(403)
        .json({ erro: "Sem permissão para este recurso", codigo: "SEM_PERMISSAO" });
    }

    req.usuario = usuario;
    return next();
  };
}
