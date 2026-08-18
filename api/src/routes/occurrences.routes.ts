import { Router } from "express";
// import { requireAuth } from "../middlewares/auth.js";

// Feedbacks para a gestão (protegido) — DONO: Victor
export const occurrencesRoutes = Router();

// GET /api/occurrences
// Lista os feedbacks recebidos (somente leitura) para a gestão.
// TODO (Victor): aplicar requireAuth e implementar conforme docs/CONTRATO-API.md
//   Ex.: occurrencesRoutes.get("/", requireAuth(["COORDENADOR","GERENTE","ADMINISTRADOR"]), handler)
occurrencesRoutes.get("/", async (_req, res) => {
  return res
    .status(501)
    .json({ erro: "Ainda não implementado", codigo: "NAO_IMPLEMENTADO" });
});
