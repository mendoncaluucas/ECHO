import type { Request, Response, NextFunction } from "express";

// Middleware de autenticação/autorização (RBAC) — DONO: Victor
//
// TODO (Victor): ler o header Authorization: Bearer <token>, validar o JWT
// e conferir se o papel do usuário está na lista de papéis permitidos.
//
// Uso pretendido:
//   router.get("/", requireAuth(["GERENTE", "ADMINISTRADOR"]), handler)
export function requireAuth(_papeisPermitidos: string[]) {
  return (_req: Request, res: Response, _next: NextFunction) => {
    return res
      .status(501)
      .json({ erro: "Autenticação ainda não implementada", codigo: "NAO_IMPLEMENTADO" });
  };
}
