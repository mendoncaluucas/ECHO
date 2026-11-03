import { Router } from "express";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { Papel } from "@prisma/client";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth } from "../middlewares/auth.js";
import { registrarAuditoria } from "../auditoria.js";
import { limiteDaImagemDoQr } from "../limites.js";

// QR Codes — geração e desativação restritas ao administrador, listagem à gestão.
// A imagem segue aberta: só serve token ativo, e o token já está impresso na mesa. Por
// ser aberta e cara de gerar, tem limite por IP e cache (ver a rota, no fim).
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
// Era 2048. Gerar a imagem ocupa o processador da API inteira enquanto roda (PNG de
// 2048 px: ~270 ms), e o front nunca pede mais que 1024; impressão usa o SVG.
const TAMANHO_MAXIMO = 1024;
// O tamanho pedido sobe para o múltiplo de 128 seguinte (até 1024): no máximo 7 PNGs
// por código. Aceitando qualquer número, bastava variar o tamanho para escapar do
// cache: 50 tamanhos diferentes ainda deixavam o /health em 1,7 s (medido).
const PASSO_DO_TAMANHO = 128;
const arredondarTamanho = (tamanho: number) =>
  Math.min(TAMANHO_MAXIMO, Math.ceil(tamanho / PASSO_DO_TAMANHO) * PASSO_DO_TAMANHO);

// Cache das imagens já geradas: o mesmo QR não é gerado duas vezes. Medido antes dele:
// 50 downloads de 2048 px ao mesmo tempo deixavam um pedido qualquer (o /health) em
// 4,3 s, a API inteira lenta para todos.
//
// Guarda a promessa, e não só o resultado: 50 pedidos iguais ao mesmo tempo geram a
// imagem uma vez e esperam juntos. Na ordem de uso (a mais antiga sai primeiro) e com
// teto, para variar o tamanho não encher a memória: ~200 imagens de até 1024 px dão
// poucos MB.
type ImagemDoQr = { tipo: string; corpo: Buffer | string };
const MAXIMO_NO_CACHE = 200;
const cacheDeImagens = new Map<string, Promise<ImagemDoQr>>();

export function limparCacheDeImagens() {
  cacheDeImagens.clear();
}

function imagemDoQr(token: string, formato: "png" | "svg", tamanho: number): Promise<ImagemDoQr> {
  // O SVG não tem tamanho: um só por código.
  const chave = formato === "svg" ? `${token}|svg` : `${token}|png|${tamanho}`;
  const guardada = cacheDeImagens.get(chave);
  if (guardada) {
    // Usada agora: vai para o fim da fila de saída.
    cacheDeImagens.delete(chave);
    cacheDeImagens.set(chave, guardada);
    return guardada;
  }

  const url = urlDoFormulario(token);
  const gerando: Promise<ImagemDoQr> =
    formato === "svg"
      ? QRCode.toString(url, { ...OPCOES_DO_QR, type: "svg" }).then((corpo) => ({ tipo: "image/svg+xml", corpo }))
      : QRCode.toBuffer(url, { ...OPCOES_DO_QR, width: tamanho }).then((corpo) => ({ tipo: "png", corpo }));
  // Falhou: não fica no cache, para o próximo pedido tentar de novo. Só sai se ainda for
  // ela: se já foi empurrada para fora e outra igual entrou no lugar, a nova fica.
  gerando.catch(() => {
    if (cacheDeImagens.get(chave) === gerando) cacheDeImagens.delete(chave);
  });

  cacheDeImagens.set(chave, gerando);
  if (cacheDeImagens.size > MAXIMO_NO_CACHE) {
    cacheDeImagens.delete(cacheDeImagens.keys().next().value!);
  }
  return gerando;
}

// GET /:token/imagem — o QR para exibir ou imprimir. Ver docs/CONTRATO-API.md
//
// `?formato=svg` sai vetorial: nítido em qualquer tamanho, que é o que a tela de
// apresentação e o cartão impresso usam. O PNG (padrão) aceita `?tamanho=` para quem
// precisa de arquivo de imagem.
//
// Pública e cara de gerar: limite por IP (src/limites.ts) antes de tudo, contando
// também os pedidos inválidos, e cache das imagens geradas.
qrcodesRoutes.get(
  "/:token/imagem",
  limiteDaImagemDoQr,
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

    // A cada pedido, mesmo com a imagem no cache: o QR desativado é recusado na hora.
    const qr = await prisma.qRCode.findUnique({ where: { token } });
    if (!qr || !qr.ativo) {
      return res
        .status(404)
        .json({ erro: "QR Code não encontrado", codigo: "QR_NAO_ENCONTRADO" });
    }

    const imagem = await imagemDoQr(qr.token, formato, arredondarTamanho(tamanho));
    // O navegador reaproveita por 5 min sem pedir de novo. "private": é da tela de quem
    // pediu, não de um cache compartilhado no caminho.
    res.set("Cache-Control", "private, max-age=300");
    return res.type(imagem.tipo).send(imagem.corpo);
  })
);
