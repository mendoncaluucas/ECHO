import { Router } from "express";
import { Papel } from "@prisma/client";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth } from "../middlewares/auth.js";
import { registrarAuditoria } from "../auditoria.js";
import {
  DURACAO_SESSAO_MAXIMA_HORAS,
  DURACAO_SESSAO_MINIMA_HORAS,
  ID_DA_CONFIGURACAO,
  lerConfiguracoes,
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

// PATCH / — altera as configurações. Ver docs/CONTRATO-API.md
configuracoesRoutes.patch(
  "/",
  requireAuth([Papel.ADMINISTRADOR]),
  asyncHandler(async (req, res) => {
    const { duracaoSessaoHoras } = req.body ?? {};

    if (
      !Number.isInteger(duracaoSessaoHoras) ||
      duracaoSessaoHoras < DURACAO_SESSAO_MINIMA_HORAS ||
      duracaoSessaoHoras > DURACAO_SESSAO_MAXIMA_HORAS
    ) {
      return res.status(400).json({
        erro: `duracaoSessaoHoras deve ser um inteiro de ${DURACAO_SESSAO_MINIMA_HORAS} a ${DURACAO_SESSAO_MAXIMA_HORAS}`,
        codigo: "VALIDACAO",
      });
    }

    const antes = await lerConfiguracoes();

    const depois = await prisma.$transaction(async (tx) => {
      // Upsert: a linha só passa a existir na primeira vez que alguém salva.
      const salva = await tx.configuracao.upsert({
        where: { id: ID_DA_CONFIGURACAO },
        create: { id: ID_DA_CONFIGURACAO, duracaoSessaoHoras },
        update: { duracaoSessaoHoras },
        select: { duracaoSessaoHoras: true },
      });

      // Mudar quanto tempo um login vale é decisão de segurança; quem mudou e de
      // quanto para quanto tem que ficar registrado.
      if (antes.duracaoSessaoHoras !== duracaoSessaoHoras) {
        await registrarAuditoria(tx, {
          acao: "CONFIGURACAO_ALTERADA",
          usuarioId: req.usuario!.sub,
          entidade: "Configuracao",
          entidadeId: ID_DA_CONFIGURACAO,
          detalhes: {
            campo: "duracaoSessaoHoras",
            de: antes.duracaoSessaoHoras,
            para: duracaoSessaoHoras,
          },
        });
      }

      return salva;
    });

    return res.json(depois);
  })
);
