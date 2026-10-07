import { Router } from "express";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { Papel } from "@prisma/client";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth } from "../middlewares/auth.js";
import { registrarAuditoria } from "../auditoria.js";

// QR Codes — geração e desativação restritas ao administrador, listagem à gestão.
// A imagem segue aberta: só serve token ativo, e o token já está impresso na mesa.
export const qrcodesRoutes = Router();

const PAPEIS_DA_GESTAO = [Papel.COORDENADOR, Papel.GERENTE, Papel.ADMINISTRADOR];

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://localhost:5173";
const urlDoFormulario = (token: string) => `${WEB_BASE_URL}/feedback?t=${token}`;

// Correção de erro "M" (15% do código pode estar danificado) e margem de 2 módulos:
// lê bem projetado na parede e impresso em papel que amassa na mesa.
const OPCOES_DO_QR = { errorCorrectionLevel: "M" as const, margin: 2 };

// GET / — lista os QR Codes cadastrados. Ver docs/CONTRATO-API.md
//
// Protegido: a listagem entrega todos os tokens de uma vez, e com eles dá para enviar
// feedback em nome de qualquer área sem passar por nenhuma mesa.
qrcodesRoutes.get(
  "/",
  requireAuth(PAPEIS_DA_GESTAO),
  asyncHandler(async (_req, res) => {
    const qrs = await prisma.qRCode.findMany({
      orderBy: [{ ativo: "desc" }, { criadoEm: "desc" }],
      select: {
        id: true,
        token: true,
        ativo: true,
        criadoEm: true,
        area: { select: { id: true, nome: true } },
      },
    });

    // A URL vai pronta: o front não sabe para que endereço o QR aponta (WEB_BASE_URL).
    return res.json({ itens: qrs.map((qr) => ({ ...qr, url: urlDoFormulario(qr.token) })) });
  })
);

// POST / — cria um QR Code para uma área. Ver docs/CONTRATO-API.md
//
// `desativarAnteriores: true` é o "substituir": o código novo nasce e os ativos da
// mesma área deixam de valer, na mesma transação. Sem isso, cada "gerar" somava mais
// um código valendo para a mesma mesa — e um QR perdido continuava aceitando feedback.
qrcodesRoutes.post(
  "/",
  requireAuth([Papel.ADMINISTRADOR]),
  asyncHandler(async (req, res) => {
    const { areaId, token, desativarAnteriores } = req.body ?? {};

    if (typeof areaId !== "string" || areaId.length === 0) {
      return res.status(400).json({ erro: "areaId é obrigatório", codigo: "VALIDACAO" });
    }
    if (desativarAnteriores !== undefined && typeof desativarAnteriores !== "boolean") {
      return res
        .status(400)
        .json({ erro: "desativarAnteriores deve ser booleano", codigo: "VALIDACAO" });
    }

    const area = await prisma.area.findUnique({ where: { id: areaId } });
    if (!area) {
      return res
        .status(404)
        .json({ erro: "Área não encontrada", codigo: "AREA_NAO_ENCONTRADA" });
    }
    // O QR nasceria morto: os endpoints públicos recusam área desativada. O gerador
    // já filtra as inativas, mas a regra é do backend.
    if (!area.ativo) {
      return res.status(400).json({
        erro: "Área desativada não recebe QR Code novo",
        codigo: "AREA_INATIVA",
      });
    }

    const tokenFinal =
      typeof token === "string" && token.length > 0
        ? token
        : randomBytes(6).toString("hex");

    const jaExiste = await prisma.qRCode.findUnique({ where: { token: tokenFinal } });
    if (jaExiste) {
      return res.status(409).json({ erro: "token já em uso", codigo: "TOKEN_DUPLICADO" });
    }

    const usuarioId = req.usuario!.sub;

    // Em corrida, a constraint única dispara P2002 → 409 no error handler global.
    const qr = await prisma.$transaction(async (tx) => {
      const anteriores = desativarAnteriores
        ? await tx.qRCode.findMany({
            where: { areaId: area.id, ativo: true },
            select: { id: true, token: true },
          })
        : [];

      if (anteriores.length > 0) {
        await tx.qRCode.updateMany({
          where: { id: { in: anteriores.map((a) => a.id) } },
          data: { ativo: false },
        });
        for (const anterior of anteriores) {
          await registrarAuditoria(tx, {
            acao: "QRCODE_DESATIVADO",
            usuarioId,
            entidade: "QRCode",
            entidadeId: anterior.id,
            detalhes: { area: area.nome, token: anterior.token, motivo: "substituido" },
          });
        }
      }

      const criado = await tx.qRCode.create({
        data: { token: tokenFinal, areaId: area.id },
        select: { id: true, token: true },
      });

      await registrarAuditoria(tx, {
        acao: "QRCODE_GERADO",
        usuarioId,
        entidade: "QRCode",
        entidadeId: criado.id,
        detalhes: { area: area.nome, token: criado.token },
      });

      return criado;
    });

    const url = urlDoFormulario(qr.token);
    const imagem = await QRCode.toDataURL(url, { ...OPCOES_DO_QR, width: 512 });

    return res.status(201).json({ id: qr.id, token: qr.token, url, imagem });
  })
);

// PATCH /:id — desativa ou reativa um QR Code. Ver docs/CONTRATO-API.md
//
// Para o QR perdido, roubado ou estragado: tira só aquele código de circulação, sem
// desativar a área inteira (que derrubaria os outros códigos dela).
qrcodesRoutes.patch(
  "/:id",
  requireAuth([Papel.ADMINISTRADOR]),
  asyncHandler(async (req, res) => {
    const { ativo } = req.body ?? {};
    if (typeof ativo !== "boolean") {
      return res.status(400).json({ erro: "ativo deve ser booleano", codigo: "VALIDACAO" });
    }

    const antes = await prisma.qRCode.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        token: true,
        ativo: true,
        area: { select: { nome: true, ativo: true } },
      },
    });
    if (!antes) {
      return res
        .status(404)
        .json({ erro: "QR Code não encontrado", codigo: "QR_NAO_ENCONTRADO" });
    }
    // Mesma regra do POST: reativado numa área desativada, o código constaria como
    // valendo, mas o formulário recusaria quem escaneasse.
    if (ativo && !antes.area.ativo) {
      return res.status(400).json({
        erro: "Área desativada não tem QR Code ativo",
        codigo: "AREA_INATIVA",
      });
    }

    const atualizado = await prisma.$transaction(async (tx) => {
      const qr = await tx.qRCode.update({
        where: { id: antes.id },
        data: { ativo },
        select: {
          id: true,
          token: true,
          ativo: true,
          criadoEm: true,
          area: { select: { id: true, nome: true } },
        },
      });

      if (antes.ativo !== ativo) {
        await registrarAuditoria(tx, {
          acao: ativo ? "QRCODE_REATIVADO" : "QRCODE_DESATIVADO",
          usuarioId: req.usuario!.sub,
          entidade: "QRCode",
          entidadeId: antes.id,
          detalhes: { area: antes.area.nome, token: antes.token },
        });
      }

      return qr;
    });

    return res.json({ ...atualizado, url: urlDoFormulario(atualizado.token) });
  })
);

const TAMANHO_PADRAO = 400;
const TAMANHO_MINIMO = 200;
const TAMANHO_MAXIMO = 2048;

// GET /:token/imagem — o QR para exibir ou imprimir. Ver docs/CONTRATO-API.md
//
// `?formato=svg` sai vetorial: nítido em qualquer tamanho, que é o que a tela de
// apresentação e o cartão impresso usam. O PNG (padrão) aceita `?tamanho=` para quem
// precisa de arquivo de imagem.
qrcodesRoutes.get(
  "/:token/imagem",
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    const formato = req.query.formato ?? "png";
    if (formato !== "png" && formato !== "svg") {
      return res.status(400).json({ erro: "formato deve ser png ou svg", codigo: "VALIDACAO" });
    }

    const tamanhoInformado = req.query.tamanho;
    const tamanho = tamanhoInformado === undefined ? TAMANHO_PADRAO : Number(tamanhoInformado);
    if (!Number.isInteger(tamanho) || tamanho < TAMANHO_MINIMO || tamanho > TAMANHO_MAXIMO) {
      return res.status(400).json({
        erro: `tamanho deve ser um inteiro de ${TAMANHO_MINIMO} a ${TAMANHO_MAXIMO}`,
        codigo: "VALIDACAO",
      });
    }

    const qr = await prisma.qRCode.findUnique({ where: { token } });
    if (!qr || !qr.ativo) {
      return res
        .status(404)
        .json({ erro: "QR Code não encontrado", codigo: "QR_NAO_ENCONTRADO" });
    }

    const url = urlDoFormulario(qr.token);

    if (formato === "svg") {
      const svg = await QRCode.toString(url, { ...OPCOES_DO_QR, type: "svg" });
      return res.type("image/svg+xml").send(svg);
    }

    const png = await QRCode.toBuffer(url, { ...OPCOES_DO_QR, width: tamanho });
    return res.type("png").send(png);
  })
);
