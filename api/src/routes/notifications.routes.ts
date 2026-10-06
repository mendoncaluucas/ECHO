import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth } from "../middlewares/auth.js";
import { ERRO_DE_PAGINACAO, lerPaginacao } from "../consulta.js";

// Notificações da gestão — cada usuário vê e marca só as próprias. DONO: Lucas
// Quem cria é o POST /public/feedback, uma por destinatário.
//
// Marcar como lida não entra no log de auditoria: é rotina pessoal, não uma
// alteração no sistema.
export const notificationsRoutes = Router();

// contatoEmail fica de fora, como na listagem de ocorrências (LGPD).
const camposDaNotificacao = {
  id: true,
  lida: true,
  criadoEm: true,
  feedback: {
    select: {
      id: true,
      tipo: true,
      comentario: true,
      status: true,
      area: { select: { nome: true } },
      avaliacoes: {
        orderBy: { category: { nome: "asc" } },
        select: { estrelas: true, category: { select: { nome: true } } },
      },
    },
  },
} as const;

type NotificacaoBruta = Prisma.NotificationGetPayload<{ select: typeof camposDaNotificacao }>;

// Achata a avaliação para { categoria, estrelas }, o mesmo formato das ocorrências.
function formatar(notificacao: NotificacaoBruta) {
  return {
    ...notificacao,
    feedback: {
      ...notificacao.feedback,
      avaliacoes: notificacao.feedback.avaliacoes.map((a) => ({
        categoria: a.category.nome,
        estrelas: a.estrelas,
      })),
    },
  };
}

// GET / — notificações de quem está logado, das mais recentes às mais antigas.
notificationsRoutes.get(
  "/",
  requireAuth([]),
  asyncHandler(async (req, res) => {
    const paginacao = lerPaginacao(req.query);
    if (!paginacao) {
      return res.status(400).json(ERRO_DE_PAGINACAO);
    }
    const { pagina, porPagina } = paginacao;

    const { lida } = req.query;
    if (lida !== undefined && lida !== "true" && lida !== "false") {
      return res.status(400).json({ erro: "lida deve ser true ou false", codigo: "VALIDACAO" });
    }

    const usuarioId = req.usuario!.sub;
    const where: Prisma.NotificationWhereInput = {
      usuarioId,
      ...(lida !== undefined && { lida: lida === "true" }),
    };

    const [total, naoLidas, itens] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { usuarioId, lida: false } }),
      prisma.notification.findMany({
        where,
        // O id desempata registros do mesmo milissegundo, para a paginação não
        // repetir nem pular linha.
        orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        select: camposDaNotificacao,
      }),
    ]);

    return res.json({
      itens: itens.map(formatar),
      total,
      naoLidas,
      pagina,
      porPagina,
      paginas: Math.max(1, Math.ceil(total / porPagina)),
    });
  })
);

// GET /contagem — só o número de não lidas, para o sino do cabeçalho. Ver docs/CONTRATO-API.md
// Separado da listagem porque o sino consulta a cada minuto e não precisa de mais nada.
notificationsRoutes.get(
  "/contagem",
  requireAuth([]),
  asyncHandler(async (req, res) => {
    const naoLidas = await prisma.notification.count({
      where: { usuarioId: req.usuario!.sub, lida: false },
    });
    return res.json({ naoLidas });
  })
);

// POST /marcar-todas-lidas — zera as não lidas de quem está logado.
notificationsRoutes.post(
  "/marcar-todas-lidas",
  requireAuth([]),
  asyncHandler(async (req, res) => {
    const { count } = await prisma.notification.updateMany({
      where: { usuarioId: req.usuario!.sub, lida: false },
      data: { lida: true },
    });
    return res.json({ atualizadas: count });
  })
);

// PATCH /:id — marca uma notificação como lida ou não lida.
notificationsRoutes.patch(
  "/:id",
  requireAuth([]),
  asyncHandler(async (req, res) => {
    const { lida } = req.body ?? {};
    if (typeof lida !== "boolean") {
      return res.status(400).json({ erro: "lida deve ser booleano", codigo: "VALIDACAO" });
    }

    // A notificação de outra pessoa responde 404, igual à inexistente: não confirmar
    // que um id existe para quem não é o dono.
    const { count } = await prisma.notification.updateMany({
      where: { id: req.params.id, usuarioId: req.usuario!.sub },
      data: { lida },
    });
    if (count === 0) {
      return res
        .status(404)
        .json({ erro: "Notificação não encontrada", codigo: "NOTIFICACAO_NAO_ENCONTRADA" });
    }

    const notificacao = await prisma.notification.findUniqueOrThrow({
      where: { id: req.params.id },
      select: camposDaNotificacao,
    });
    return res.json(formatar(notificacao));
  })
);
