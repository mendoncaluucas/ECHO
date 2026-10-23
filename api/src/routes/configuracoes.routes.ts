import { Router } from "express";
import { Papel } from "@prisma/client";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth } from "../middlewares/auth.js";
import { registrarAuditoria } from "../auditoria.js";
import {
  CAMPOS_EDITAVEIS,
  ID_DA_CONFIGURACAO,
  LIMITES,
  lerConfiguracoes,
  type CampoEditavel,
} from "../configuracao.js";

// Configurações do sistema — restritas ao administrador. DONO: Lucas
export const configuracoesRoutes = Router();

// GET / — configurações atuais. Ver docs/CONTRATO-API.md
configuracoesRoutes.get(
  "/",
  requireAuth([Papel.ADMINISTRADOR]),
  asyncHandler(async (_req, res) => {
    return res.json(await lerConfiguracoes());
  })
);

// PATCH / — altera as configurações enviadas; as que não vierem ficam como estão.
// Ver docs/CONTRATO-API.md
configuracoesRoutes.patch(
  "/",
  requireAuth([Papel.ADMINISTRADOR]),
  asyncHandler(async (req, res) => {
    const corpo: Record<string, unknown> = req.body ?? {};
    const enviados = CAMPOS_EDITAVEIS.filter((campo) => campo in corpo);

    if (enviados.length === 0) {
      return res.status(400).json({
        erro: `Envie ao menos um destes campos: ${CAMPOS_EDITAVEIS.join(", ")}`,
        codigo: "VALIDACAO",
      });
    }

    const alteracoes: Partial<Record<CampoEditavel, number>> = {};
    for (const campo of enviados) {
      const valor = corpo[campo];
      const { min, max } = LIMITES[campo];
      if (typeof valor !== "number" || !Number.isInteger(valor) || valor < min || valor > max) {
        return res.status(400).json({
          erro: `${campo} deve ser um inteiro de ${min} a ${max}`,
          codigo: "VALIDACAO",
        });
      }
      alteracoes[campo] = valor;
    }

    const antes = await lerConfiguracoes();

    await prisma.$transaction(async (tx) => {
      // Upsert: a linha só passa a existir na primeira vez que alguém salva.
      await tx.configuracao.upsert({
        where: { id: ID_DA_CONFIGURACAO },
        create: { id: ID_DA_CONFIGURACAO, ...alteracoes },
        update: alteracoes,
      });

      // Quanto tempo um login vale e por quanto tempo um dado pessoal fica são decisões
      // de segurança e de privacidade: quem mudou, e de quanto para quanto, fica
      // registrado. Um registro por campo, como cada um aparece no log.
      for (const campo of enviados) {
        if (antes[campo] === alteracoes[campo]) continue;
        await registrarAuditoria(tx, {
          acao: "CONFIGURACAO_ALTERADA",
          usuarioId: req.usuario!.sub,
          entidade: "Configuracao",
          entidadeId: ID_DA_CONFIGURACAO,
          detalhes: { campo, de: antes[campo], para: alteracoes[campo]! },
        });
      }
    });

    return res.json(await lerConfiguracoes());
  })
);
