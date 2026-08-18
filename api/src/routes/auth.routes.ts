import { Router } from "express";

// Autenticação da gestão — DONO: Victor
export const authRoutes = Router();

// POST /api/auth/login
// Autentica Coordenador/Gerente/Administrador e devolve o JWT.
// TODO (Victor): implementar conforme docs/CONTRATO-API.md
//   body: { email, senha }  →  200: { token, usuario: { id, nome, papel } }
authRoutes.post("/login", async (_req, res) => {
  return res
    .status(501)
    .json({ erro: "Ainda não implementado", codigo: "NAO_IMPLEMENTADO" });
});
