import { Router } from "express";
import { Papel, Prisma, StatusOcorrencia, TipoFeedback } from "@prisma/client";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth } from "../middlewares/auth.js";
import { ERRO_DE_PAGINACAO, lerData, lerPaginacao, semCuringas } from "../consulta.js";
import { registrarAuditoria } from "../auditoria.js";
import { emailLigado, enviarEmails, estadoDoEnvio } from "../email.js";
import { MAX_RESPOSTA, montarResposta } from "../respostas.js";

// Feedbacks para a gestão (protegido) — DONO: Victor
export const occurrencesRoutes = Router();

const PAPEIS_DA_GESTAO = [Papel.COORDENADOR, Papel.GERENTE, Papel.ADMINISTRADOR];

// contatoEmail fica de fora de propósito: não está no contrato e é dado pessoal (LGPD).
const camposDaOcorrencia = {
  id: true,
  tipo: true,
  comentario: true,
  anonimo: true,
  criadoEm: true,
  status: true,
  tratadoEm: true,
  // Retenção (LGPD): quando o contato e o comentário foram apagados, para a tela dizer
  // "apagado em…" em vez de um espaço vazio. A data não identifica ninguém.
  contatoApagadoEm: true,
  comentarioApagadoEm: true,
  area: { select: { nome: true } },
  tratadoPor: { select: { nome: true } },
  avaliacoes: {
    orderBy: { category: { nome: "asc" } },
    select: { estrelas: true, category: { select: { nome: true } } },
  },
  // Só a contagem, para a lista dizer "Respondida" sem trazer o texto.
  _count: { select: { respostas: true } },
} as const;

// As respostas da equipe ao cliente, só no detalhe. O texto pode já ter saído pela
// retenção (textoApagadoEm); quem respondeu e quando ficam.
const camposDaResposta = {
  id: true,
  texto: true,
  textoApagadoEm: true,
  enviadaEm: true,
  autor: { select: { nome: true } },
} as const;

type OcorrenciaBruta = {
  avaliacoes: { estrelas: number; category: { nome: string } }[];
  _count: { respostas: number };
};

// Achata a avaliação para o formato do contrato: { categoria, estrelas }, e troca a
// contagem de respostas por `respondida`.
function formatar<T extends OcorrenciaBruta>({ _count, ...ocorrencia }: T) {
  return {
    ...ocorrencia,
    avaliacoes: ocorrencia.avaliacoes.map((avaliacao) => ({
      categoria: avaliacao.category.nome,
      estrelas: avaliacao.estrelas,
    })),
    respondida: _count.respostas > 0,
  };
}

function textoDoFiltro(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.trim().length > 0 ? valor.trim() : undefined;
}

// GET / — lista os feedbacks recebidos, paginados e filtrados. Ver docs/CONTRATO-API.md
occurrencesRoutes.get(
  "/",
  requireAuth(PAPEIS_DA_GESTAO),
  asyncHandler(async (req, res) => {
    const paginacao = lerPaginacao(req.query);
    if (!paginacao) {
      return res.status(400).json(ERRO_DE_PAGINACAO);
    }
    const { pagina, porPagina } = paginacao;

    const { status, tipo } = req.query;
    if (status !== undefined && !Object.values(StatusOcorrencia).includes(status as never)) {
      return res.status(400).json({ erro: "status inválido", codigo: "VALIDACAO" });
    }
    if (tipo !== undefined && !Object.values(TipoFeedback).includes(tipo as never)) {
      return res.status(400).json({ erro: "tipo inválido", codigo: "VALIDACAO" });
    }

    const de = lerData(req.query.de);
    const ate = lerData(req.query.ate, true);
    if (de === null || ate === null) {
      return res.status(400).json({ erro: "data deve ser YYYY-MM-DD", codigo: "VALIDACAO" });
    }

    const categoria = textoDoFiltro(req.query.categoria);
    const busca = textoDoFiltro(req.query.busca);

    const where: Prisma.FeedbackWhereInput = {
      ...(status !== undefined && { status: status as StatusOcorrencia }),
      ...(tipo !== undefined && { tipo: tipo as TipoFeedback }),
      ...((de || ate) && { criadoEm: { ...(de && { gte: de }), ...(ate && { lte: ate }) } }),
      // Categoria é por avaliação: traz quem pontuou aquela categoria.
      ...(categoria && {
        avaliacoes: { some: { category: { nome: { equals: semCuringas(categoria), mode: "insensitive" } } } },
      }),
      // A busca cobre o comentário e o nome da área, que é o que a tela expõe.
      ...(busca && {
        OR: [
          { comentario: { contains: semCuringas(busca), mode: "insensitive" } },
          { area: { nome: { contains: semCuringas(busca), mode: "insensitive" } } },
        ],
      }),
    };

    const [total, feedbacks] = await Promise.all([
      prisma.feedback.count({ where }),
      prisma.feedback.findMany({
        where,
        orderBy: { criadoEm: "desc" },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        select: camposDaOcorrencia,
      }),
    ]);

    return res.json({
      itens: feedbacks.map(formatar),
      total,
      pagina,
      porPagina,
      paginas: Math.max(1, Math.ceil(total / porPagina)),
    });
  })
);

// GET /:id — detalhe de uma ocorrência. Ver docs/CONTRATO-API.md
//
// O único lugar em que o contato do cliente sai: quem abre a ocorrência é quem vai
// responder. Listagens, notificações e métricas nunca o trazem (LGPD).
occurrencesRoutes.get(
  "/:id",
  requireAuth(PAPEIS_DA_GESTAO),
  asyncHandler(async (req, res) => {
    const ocorrencia = await prisma.feedback.findUnique({
      where: { id: req.params.id },
      select: {
        ...camposDaOcorrencia,
        contatoNome: true,
        contatoEmail: true,
        respostas: { orderBy: { enviadaEm: "asc" }, select: camposDaResposta },
      },
    });

    if (!ocorrencia) {
      return res
        .status(404)
        .json({ erro: "Ocorrência não encontrada", codigo: "OCORRENCIA_NAO_ENCONTRADA" });
    }

    const { contatoNome, contatoEmail, ...resto } = ocorrencia;
    return res.json({
      ...formatar(resto),
      // null para anônimo: o front não precisa saber por que não há contato.
      contato:
        !resto.anonimo && contatoEmail ? { nome: contatoNome, email: contatoEmail } : null,
      // Para a tela oferecer (ou não) a resposta pelo Echo, e dizer quando está em teste.
      envioDeEmail: estadoDoEnvio(),
    });
  })
);

// POST /:id/respostas — responde ao cliente por e-mail. Ver docs/CONTRATO-API.md
//
// Envia primeiro e grava depois: gravar antes deixaria registrada como enviada uma
// resposta que o provedor recusou. A pessoa espera o envio (ao contrário do aviso à
// equipe), porque precisa saber se chegou a sair.
occurrencesRoutes.post(
  "/:id/respostas",
  requireAuth(PAPEIS_DA_GESTAO),
  asyncHandler(async (req, res) => {
    const bruto = req.body?.texto;
    // O textarea pode mandar \r\n; o e-mail e o que fica guardado usam \n.
    const texto = typeof bruto === "string" ? bruto.replace(/\r\n?/g, "\n").trim() : "";
    if (texto.length === 0 || texto.length > MAX_RESPOSTA) {
      return res.status(400).json({
        erro: `texto obrigatório, com no máximo ${MAX_RESPOSTA} caracteres`,
        codigo: "VALIDACAO",
      });
    }

    const feedback = await prisma.feedback.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        anonimo: true,
        contatoEmail: true,
        criadoEm: true,
        venue: { select: { nome: true } },
        area: { select: { nome: true } },
      },
    });
    if (!feedback) {
      return res
        .status(404)
        .json({ erro: "Ocorrência não encontrada", codigo: "OCORRENCIA_NAO_ENCONTRADA" });
    }
    // Anônimo, ou o contato já saiu pela retenção: não há a quem responder.
    if (feedback.anonimo || !feedback.contatoEmail) {
      return res
        .status(409)
        .json({ erro: "O cliente não deixou contato para resposta.", codigo: "SEM_CONTATO" });
    }
    if (!emailLigado()) {
      return res.status(503).json({
        erro: "O envio de e-mail não está ligado neste servidor.",
        codigo: "EMAIL_DESLIGADO",
      });
    }

    const usuarioId = req.usuario!.sub;
    const autor = await prisma.user.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { nome: true, email: true },
    });

    try {
      await enviarEmails([
        montarResposta({
          texto,
          para: feedback.contatoEmail,
          autor,
          restaurante: feedback.venue.nome,
          avaliadoEm: feedback.criadoEm,
        }),
      ]);
    } catch (erro) {
      // Só a mensagem do provedor no log; o texto e o e-mail do cliente, não.
      console.error("Resposta ao cliente não enviada:", erro instanceof Error ? erro.message : erro);
      return res.status(502).json({
        erro: "O e-mail não foi enviado. Tente de novo em instantes.",
        codigo: "EMAIL_NAO_ENVIADO",
      });
    }

    const resposta = await prisma.$transaction(async (tx) => {
      const criada = await tx.resposta.create({
        data: { feedbackId: feedback.id, autorId: usuarioId, texto },
        select: camposDaResposta,
      });
      // Sem o texto nem o e-mail: o log guarda que houve resposta, não o conteúdo.
      await registrarAuditoria(tx, {
        acao: "RESPOSTA_ENVIADA",
        usuarioId,
        entidade: "Feedback",
        entidadeId: feedback.id,
        detalhes: { area: feedback.area?.nome ?? null },
      });
      return criada;
    });

    return res.status(201).json(resposta);
  })
);

// PATCH /:id — muda o status da ocorrência. Ver docs/CONTRATO-API.md
occurrencesRoutes.patch(
  "/:id",
  requireAuth(PAPEIS_DA_GESTAO),
  asyncHandler(async (req, res) => {
    const { status } = req.body ?? {};

    if (!Object.values(StatusOcorrencia).includes(status)) {
      return res.status(400).json({
        erro: "status inválido (PENDENTE, EM_ANDAMENTO ou RESOLVIDO)",
        codigo: "VALIDACAO",
      });
    }

    const antes = await prisma.feedback.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, area: { select: { nome: true } } },
    });
    if (!antes) {
      return res
        .status(404)
        .json({ erro: "Ocorrência não encontrada", codigo: "OCORRENCIA_NAO_ENCONTRADA" });
    }

    const usuarioId = req.usuario!.sub;

    const atualizada = await prisma.$transaction(async (tx) => {
      // Registra quem tratou a partir do token, nunca do corpo da requisição.
      const ocorrencia = await tx.feedback.update({
        where: { id: antes.id },
        data: { status, tratadoPorId: usuarioId, tratadoEm: new Date() },
        select: camposDaOcorrencia,
      });

      // Reenviar o mesmo status não muda nada que valha registrar.
      if (antes.status !== status) {
        await registrarAuditoria(tx, {
          acao: "OCORRENCIA_STATUS",
          usuarioId,
          entidade: "Feedback",
          entidadeId: antes.id,
          detalhes: { de: antes.status, para: status, area: antes.area?.nome ?? null },
        });
      }

      return ocorrencia;
    });

    return res.json(formatar(atualizada));
  })
);
