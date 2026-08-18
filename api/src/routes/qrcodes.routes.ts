import { Router } from "express";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";

// Geração de QR Code — DONO: Lucas
// Cada QR aponta para a URL do formulário do cliente, carregando o token.
// OBS: criar QR é ação de setup — no futuro deve ser protegido pelo RBAC (middleware do Victor).
export const qrcodesRoutes = Router();

// Base da URL do frontend (onde o cliente abre o formulário).
const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://localhost:5173";
const urlDoFormulario = (token: string) => `${WEB_BASE_URL}/feedback?t=${token}`;

// POST /api/qrcodes
// Cria um QR Code para uma área e devolve token, URL e a imagem (PNG data URL).
//   body: { areaId, token? }   // token opcional (ex.: "MESA12"); se ausente, gera um aleatório
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

    // token: usa o informado ou gera um aleatório
    const tokenFinal =
      typeof token === "string" && token.length > 0
        ? token
        : randomBytes(6).toString("hex");

    const jaExiste = await prisma.qRCode.findUnique({ where: { token: tokenFinal } });
    if (jaExiste) {
      return res.status(409).json({ erro: "token já em uso", codigo: "TOKEN_DUPLICADO" });
    }

    // Em caso de corrida, a restrição única do banco dispara P2002,
    // tratado como 409 pelo error handler global.
    const qr = await prisma.qRCode.create({
      data: { token: tokenFinal, areaId: area.id },
      select: { id: true, token: true },
    });

    const url = urlDoFormulario(qr.token);
    const imagem = await QRCode.toDataURL(url); // PNG em data URL (base64)

    return res.status(201).json({ id: qr.id, token: qr.token, url, imagem });
  })
);

// GET /api/qrcodes/:token/imagem
// Devolve a imagem PNG do QR (útil para imprimir). Escaneada, abre o formulário.
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
