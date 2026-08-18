import { Router } from "express";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";

// TODO: exigir RBAC quando o middleware de autenticação estiver pronto.
export const qrcodesRoutes = Router();

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://localhost:5173";
const urlDoFormulario = (token: string) => `${WEB_BASE_URL}/feedback?t=${token}`;

// POST / — cria um QR Code para uma área. Ver docs/CONTRATO-API.md
qrcodesRoutes.post(
  "/",
  asyncHandler(async (req, res) => {
    const { areaId, token } = req.body ?? {};

    if (typeof areaId !== "string" || areaId.length === 0) {
      return res.status(400).json({ erro: "areaId é obrigatório", codigo: "VALIDACAO" });
    }

    const area = await prisma.area.findUnique({ where: { id: areaId } });
    if (!area) {
      return res
        .status(404)
        .json({ erro: "Área não encontrada", codigo: "AREA_NAO_ENCONTRADA" });
    }

    const tokenFinal =
      typeof token === "string" && token.length > 0
        ? token
        : randomBytes(6).toString("hex");

    const jaExiste = await prisma.qRCode.findUnique({ where: { token: tokenFinal } });
    if (jaExiste) {
      return res.status(409).json({ erro: "token já em uso", codigo: "TOKEN_DUPLICADO" });
    }

    // Em corrida, a constraint única dispara P2002 → 409 no error handler global.
    const qr = await prisma.qRCode.create({
      data: { token: tokenFinal, areaId: area.id },
      select: { id: true, token: true },
    });

    const url = urlDoFormulario(qr.token);
    const imagem = await QRCode.toDataURL(url);

    return res.status(201).json({ id: qr.id, token: qr.token, url, imagem });
  })
);

// GET /:token/imagem — PNG do QR para impressão.
qrcodesRoutes.get(
  "/:token/imagem",
  asyncHandler(async (req, res) => {
    const { token } = req.params;

    const qr = await prisma.qRCode.findUnique({ where: { token } });
    if (!qr || !qr.ativo) {
      return res
        .status(404)
        .json({ erro: "QR Code não encontrado", codigo: "QR_NAO_ENCONTRADO" });
    }

    const png = await QRCode.toBuffer(urlDoFormulario(qr.token), { width: 400 });
    res.type("png").send(png);
  })
);
