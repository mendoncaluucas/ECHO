import { Router } from "express";
import { Papel } from "@prisma/client";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth } from "../middlewares/auth.js";
import { registrarAuditoria } from "../auditoria.js";

// Áreas do restaurante — listagem aberta (alimenta o gerador de QR Code),
// escrita restrita ao administrador.
export const areasRoutes = Router();

const camposDaArea = {
  id: true,
  nome: true,
  ativo: true,
  venue: { select: { nome: true } },
} as const;

function nomeValido(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim().length > 0;
}

// A constraint do banco é @@unique([venueId, nome]), por texto exato. Sem o trim,
// "Mesa 1" e "Mesa 1 " entrariam como áreas diferentes e o gerente veria duas iguais.
function normalizar(nome: string) {
  return nome.trim();
}

// Com um único restaurante cadastrado — o caso do Sinuelo — não faz sentido exigir
// venueId de quem está na tela. Com mais de um, a escolha passa a ser obrigatória.
//
// Devolve o motivo junto, porque "não achei o restaurante que você mandou" e
// "você não mandou e eu não sei qual é" pedem mensagens diferentes.
type ResultadoDoVenue =
  | { ok: true; id: string }
  | { ok: false; motivo: "NAO_EXISTE" | "AMBIGUO" };

async function resolverVenue(venueId: unknown): Promise<ResultadoDoVenue> {
  if (typeof venueId === "string" && venueId.length > 0) {
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true },
    });
    return venue ? { ok: true, id: venue.id } : { ok: false, motivo: "NAO_EXISTE" };
  }

  const venues = await prisma.venue.findMany({ take: 2, select: { id: true } });
  return venues.length === 1
    ? { ok: true, id: venues[0].id }
    : { ok: false, motivo: "AMBIGUO" };
}

// GET / — lista as áreas. Ver docs/CONTRATO-API.md
// Devolve ativas e inativas: o gerador de QR filtra as ativas, e a tela de
// configurações precisa enxergar as duas para poder reativar.
areasRoutes.get(
  "/",
  asyncHandler(async (_req, res) => {
    const itens = await prisma.area.findMany({
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
      select: camposDaArea,
    });

    return res.json({ itens });
  })
);

// POST / — cadastra uma área. Ver docs/CONTRATO-API.md
areasRoutes.post(
  "/",
  requireAuth([Papel.ADMINISTRADOR]),
  asyncHandler(async (req, res) => {
    const { nome, venueId } = req.body ?? {};

    if (!nomeValido(nome)) {
      return res.status(400).json({ erro: "nome é obrigatório", codigo: "VALIDACAO" });
    }

    const venue = await resolverVenue(venueId);
    if (!venue.ok) {
      return venue.motivo === "NAO_EXISTE"
        ? res
            .status(404)
            .json({ erro: "Restaurante não encontrado", codigo: "VENUE_NAO_ENCONTRADO" })
        : res.status(400).json({
            erro: "venueId é obrigatório quando há mais de um restaurante cadastrado",
            codigo: "VALIDACAO",
          });
    }

    // Nome repetido no mesmo restaurante cai no P2002 e vira 409 no error handler.
    const area = await prisma.$transaction(async (tx) => {
      const criada = await tx.area.create({
        data: { nome: normalizar(nome), venueId: venue.id },
        select: camposDaArea,
      });

      await registrarAuditoria(tx, {
        acao: "AREA_CRIADA",
        usuarioId: req.usuario!.sub,
        entidade: "Area",
        entidadeId: criada.id,
        detalhes: { nome: criada.nome },
      });

      return criada;
    });

    return res.status(201).json(area);
  })
);

// PATCH /:id — renomeia ou ativa/desativa a área. Ver docs/CONTRATO-API.md
areasRoutes.patch(
  "/:id",
  requireAuth([Papel.ADMINISTRADOR]),
  asyncHandler(async (req, res) => {
    const { nome, ativo } = req.body ?? {};

    if (nome !== undefined && !nomeValido(nome)) {
      return res.status(400).json({ erro: "nome é obrigatório", codigo: "VALIDACAO" });
    }
    if (ativo !== undefined && typeof ativo !== "boolean") {
      return res.status(400).json({ erro: "ativo deve ser booleano", codigo: "VALIDACAO" });
    }

    const antes = await prisma.area.findUnique({
      where: { id: req.params.id },
      select: { id: true, nome: true, ativo: true },
    });
    if (!antes) {
      return res
        .status(404)
        .json({ erro: "Área não encontrada", codigo: "AREA_NAO_ENCONTRADA" });
    }

    const nomeNovo = nome !== undefined ? normalizar(nome) : undefined;
    const renomeou = nomeNovo !== undefined && nomeNovo !== antes.nome;
    const mudouSituacao = ativo !== undefined && ativo !== antes.ativo;
    const usuarioId = req.usuario!.sub;

    const atualizada = await prisma.$transaction(async (tx) => {
      const area = await tx.area.update({
        where: { id: antes.id },
        data: {
          ...(nomeNovo !== undefined && { nome: nomeNovo }),
          ...(ativo !== undefined && { ativo }),
        },
        select: camposDaArea,
      });

      if (renomeou) {
        await registrarAuditoria(tx, {
          acao: "AREA_RENOMEADA",
          usuarioId,
          entidade: "Area",
          entidadeId: antes.id,
          detalhes: { de: antes.nome, para: area.nome },
        });
      }
      if (mudouSituacao) {
        await registrarAuditoria(tx, {
          acao: ativo ? "AREA_REATIVADA" : "AREA_DESATIVADA",
          usuarioId,
          entidade: "Area",
          entidadeId: antes.id,
          detalhes: { nome: area.nome },
        });
      }

      return area;
    });

    return res.json(atualizada);
  })
);
