import { Router } from "express";
import { Papel, Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth } from "../middlewares/auth.js";
import { registrarAuditoria } from "../auditoria.js";
import { semCuringas } from "../consulta.js";

// Respostas prontas: modelos que a equipe escolhe ao responder o cliente e ajusta
// antes de enviar. Toda a gestão lê (é quem responde); só o administrador cadastra.
export const respostasProntasRoutes = Router();

export const MAX_TITULO = 80;
// Abaixo dos 2000 da resposta: o modelo entra depois da saudação, que também conta.
export const MAX_TEXTO_DO_MODELO = 1500;

const camposDoModelo = {
  id: true,
  titulo: true,
  texto: true,
  ativo: true,
  atualizadoEm: true,
} as const;

const TITULO_REPETIDO = { erro: "Já existe uma resposta pronta com esse título", codigo: "CONFLITO" };

// Mesma ideia das áreas: "Desculpas" e "desculpas" seriam duas opções iguais na lista.
// A corrida rara entre dois cadastros iguais fica com o índice único (P2002 → 409).
async function tituloJaUsado(titulo: string, excetoId?: string) {
  const outro = await prisma.respostaPronta.findFirst({
    where: {
      titulo: { equals: semCuringas(titulo), mode: "insensitive" },
      ...(excetoId && { id: { not: excetoId } }),
    },
    select: { id: true },
  });
  return outro !== null;
}

// Texto aparado; \r\n do textarea vira \n, como na resposta enviada.
function lerTexto(valor: unknown, maximo: number): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.replace(/\r\n?/g, "\n").trim();
  return limpo.length > 0 && limpo.length <= maximo ? limpo : null;
}

const ERRO_TITULO = { erro: `titulo obrigatório, com no máximo ${MAX_TITULO} caracteres`, codigo: "VALIDACAO" };
const ERRO_TEXTO = {
  erro: `texto obrigatório, com no máximo ${MAX_TEXTO_DO_MODELO} caracteres`,
  codigo: "VALIDACAO",
};

function ehTituloRepetido(erro: unknown) {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002";
}

// GET / — os modelos, ativos primeiro, em ordem de título. Ver docs/CONTRATO-API.md
// Vêm os inativos também: as configurações precisam deles para reativar; a tela da
// ocorrência mostra só os ativos.
respostasProntasRoutes.get(
  "/",
  requireAuth([Papel.COORDENADOR, Papel.GERENTE, Papel.ADMINISTRADOR]),
  asyncHandler(async (_req, res) => {
    const itens = await prisma.respostaPronta.findMany({
      orderBy: [{ ativo: "desc" }, { titulo: "asc" }],
      select: camposDoModelo,
    });
    return res.json({ itens });
  })
);

// POST / — cadastra um modelo.
respostasProntasRoutes.post(
  "/",
  requireAuth([Papel.ADMINISTRADOR]),
  asyncHandler(async (req, res) => {
    const titulo = lerTexto(req.body?.titulo, MAX_TITULO);
    const texto = lerTexto(req.body?.texto, MAX_TEXTO_DO_MODELO);
    if (titulo === null) return res.status(400).json(ERRO_TITULO);
    if (texto === null) return res.status(400).json(ERRO_TEXTO);
    if (await tituloJaUsado(titulo)) return res.status(409).json(TITULO_REPETIDO);

    try {
      const modelo = await prisma.$transaction(async (tx) => {
        const criado = await tx.respostaPronta.create({ data: { titulo, texto }, select: camposDoModelo });
        await registrarAuditoria(tx, {
          acao: "RESPOSTA_PRONTA_CRIADA",
          usuarioId: req.usuario!.sub,
          entidade: "RespostaPronta",
          entidadeId: criado.id,
          detalhes: { titulo },
        });
        return criado;
      });
      return res.status(201).json(modelo);
    } catch (erro) {
      if (ehTituloRepetido(erro)) return res.status(409).json(TITULO_REPETIDO);
      throw erro;
    }
  })
);

// PATCH /:id — muda título, texto e/ou ativo. Só o que foi enviado.
respostasProntasRoutes.patch(
  "/:id",
  requireAuth([Papel.ADMINISTRADOR]),
  asyncHandler(async (req, res) => {
    const corpo = req.body ?? {};
    const titulo = corpo.titulo === undefined ? undefined : lerTexto(corpo.titulo, MAX_TITULO);
    const texto = corpo.texto === undefined ? undefined : lerTexto(corpo.texto, MAX_TEXTO_DO_MODELO);
    if (titulo === null) return res.status(400).json(ERRO_TITULO);
    if (texto === null) return res.status(400).json(ERRO_TEXTO);
    if (corpo.ativo !== undefined && typeof corpo.ativo !== "boolean") {
      return res.status(400).json({ erro: "ativo deve ser booleano", codigo: "VALIDACAO" });
    }
    const ativo: boolean | undefined = corpo.ativo;

    const antes = await prisma.respostaPronta.findUnique({
      where: { id: req.params.id },
      select: { id: true, titulo: true, texto: true, ativo: true },
    });
    if (!antes) {
      return res
        .status(404)
        .json({ erro: "Resposta pronta não encontrada", codigo: "RESPOSTA_PRONTA_NAO_ENCONTRADA" });
    }

    const mudouTitulo = titulo !== undefined && titulo !== antes.titulo;
    const mudouTexto = texto !== undefined && texto !== antes.texto;
    const mudouSituacao = ativo !== undefined && ativo !== antes.ativo;
    // O próprio modelo fica de fora: "desculpas" → "Desculpas" é só mudar a grafia.
    if (mudouTitulo && (await tituloJaUsado(titulo!, antes.id))) {
      return res.status(409).json(TITULO_REPETIDO);
    }

    const usuarioId = req.usuario!.sub;
    try {
      const modelo = await prisma.$transaction(async (tx) => {
        const atualizado = await tx.respostaPronta.update({
          where: { id: antes.id },
          data: {
            ...(mudouTitulo && { titulo }),
            ...(mudouTexto && { texto }),
            ...(mudouSituacao && { ativo }),
          },
          select: camposDoModelo,
        });

        // Editar e desativar são eventos diferentes no log, como nos usuários. O texto
        // não vai para o log: só que mudou.
        if (mudouTitulo || mudouTexto) {
          await registrarAuditoria(tx, {
            acao: "RESPOSTA_PRONTA_EDITADA",
            usuarioId,
            entidade: "RespostaPronta",
            entidadeId: antes.id,
            detalhes: {
              titulo: atualizado.titulo,
              ...(mudouTitulo && { tituloAnterior: antes.titulo }),
              textoMudou: mudouTexto,
            },
          });
        }
        if (mudouSituacao) {
          await registrarAuditoria(tx, {
            acao: ativo ? "RESPOSTA_PRONTA_REATIVADA" : "RESPOSTA_PRONTA_DESATIVADA",
            usuarioId,
            entidade: "RespostaPronta",
            entidadeId: antes.id,
            detalhes: { titulo: atualizado.titulo },
          });
        }
        return atualizado;
      });
      return res.json(modelo);
    } catch (erro) {
      if (ehTituloRepetido(erro)) return res.status(409).json(TITULO_REPETIDO);
      throw erro;
    }
  })
);
