import { Router } from "express";
import { AcaoAuditoria, Papel, Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth } from "../middlewares/auth.js";
import { ERRO_DE_PAGINACAO, lerData, lerPaginacao } from "../consulta.js";

// Log de auditoria — só leitura, restrito ao administrador. DONO: Lucas
// Quem grava é cada rota, na mesma transação da ação (ver src/auditoria.ts).
export const auditRoutes = Router();

const acoes = Object.values(AcaoAuditoria);

// GET / — lista o log, do mais recente ao mais antigo. Ver docs/CONTRATO-API.md
auditRoutes.get(
  "/",
  requireAuth([Papel.ADMINISTRADOR]),
  asyncHandler(async (req, res) => {
    const paginacao = lerPaginacao(req.query);
    if (!paginacao) {
      return res.status(400).json(ERRO_DE_PAGINACAO);
    }
    const { pagina, porPagina } = paginacao;

    const { usuarioId, acao } = req.query;
    if (usuarioId !== undefined && (typeof usuarioId !== "string" || usuarioId.length === 0)) {
      return res.status(400).json({ erro: "usuarioId inválido", codigo: "VALIDACAO" });
    }
    if (acao !== undefined && !acoes.includes(acao as never)) {
      return res.status(400).json({ erro: "acao inválida", codigo: "VALIDACAO" });
    }

    const de = lerData(req.query.de);
    const ate = lerData(req.query.ate, true);
    if (de === null || ate === null) {
      return res.status(400).json({ erro: "data deve ser YYYY-MM-DD", codigo: "VALIDACAO" });
    }

    const where: Prisma.AuditLogWhereInput = {
      ...(usuarioId !== undefined && { usuarioId }),
      ...(acao !== undefined && { acao: acao as AcaoAuditoria }),
      ...((de || ate) && { criadoEm: { ...(de && { gte: de }), ...(ate && { lte: ate }) } }),
    };

    const [total, itens] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        // O id desempata registros do mesmo milissegundo — uma edição que desativa e
        // renomeia grava dois de uma vez. Sem desempate, a ordem entre eles muda de uma
        // consulta para outra e a paginação repete ou pula linhas.
        orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        select: {
          id: true,
          acao: true,
          entidade: true,
          entidadeId: true,
          detalhes: true,
          criadoEm: true,
          usuario: { select: { id: true, nome: true } },
        },
      }),
    ]);

    return res.json({
      itens,
      total,
      pagina,
      porPagina,
      paginas: Math.max(1, Math.ceil(total / porPagina)),
    });
  })
);
