import { Router } from "express";
import { Papel } from "@prisma/client";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth } from "../middlewares/auth.js";
import { lerConfiguracoes } from "../configuracao.js";
import { aplicarRetencao, apagarDadosDoTitular, previaDaRetencao } from "../retencao.js";

// Retenção de dados (LGPD) — restrita ao administrador. DONO: Lucas
// A regra está em src/retencao.ts; a rodada automática, no server.ts.
export const retencaoRoutes = Router();

// Mais frouxo que a regra do formulário (public.routes.ts), de propósito: lá ela barra
// injeção no link mailto; aqui só apaga, e um e-mail guardado antes daquela regra
// existir precisa continuar podendo ser apagado.
const PARECE_EMAIL = /^\S+@\S+$/;
const MAX_EMAIL = 254;

// GET /previa — o que sairia se a retenção rodasse agora. Ver docs/CONTRATO-API.md
retencaoRoutes.get(
  "/previa",
  requireAuth([Papel.ADMINISTRADOR]),
  asyncHandler(async (_req, res) => {
    const [vencidos, configuracoes] = await Promise.all([previaDaRetencao(), lerConfiguracoes()]);
    return res.json({ ...vencidos, ultimaRetencaoEm: configuracoes.ultimaRetencaoEm });
  })
);

// POST /aplicar — aplica os prazos agora, sem esperar a rodada automática.
retencaoRoutes.post(
  "/aplicar",
  requireAuth([Papel.ADMINISTRADOR]),
  asyncHandler(async (req, res) => {
    return res.json(await aplicarRetencao({ usuarioId: req.usuario!.sub }));
  })
);

// POST /titular — o cliente pediu para apagar os dados dele (LGPD, art. 18).
retencaoRoutes.post(
  "/titular",
  requireAuth([Papel.ADMINISTRADOR]),
  asyncHandler(async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    if (!email || email.length > MAX_EMAIL || !PARECE_EMAIL.test(email)) {
      return res.status(400).json({ erro: "email inválido", codigo: "VALIDACAO" });
    }
    return res.json(await apagarDadosDoTitular({ email, usuarioId: req.usuario!.sub }));
  })
);
