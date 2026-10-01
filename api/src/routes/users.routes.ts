import { Router } from "express";
import bcrypt from "bcryptjs";
import { Papel } from "@prisma/client";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth } from "../middlewares/auth.js";

// Gestão de usuários — restrita ao administrador. DONO: Lucas
export const usersRoutes = Router();

const SALT_ROUNDS = 10;
export const TAMANHO_MINIMO_DA_SENHA = 8;

// senhaHash nunca sai daqui.
const camposDoUsuario = {
  id: true,
  nome: true,
  email: true,
  papel: true,
  setor: true,
  ativo: true,
  criadoEm: true,
} as const;

function textoValido(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim().length > 0;
}

// Validação proposital de e-mail: exige algo@algo.algo e nada mais. Regex de e-mail
// "completa" rejeita endereços válidos e não impede os inválidos de verdade —
// quem confirma que o endereço existe é o envio.
function emailValido(valor: unknown): valor is string {
  return typeof valor === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim());
}

export function senhaValida(valor: unknown): valor is string {
  return typeof valor === "string" && valor.length >= TAMANHO_MINIMO_DA_SENHA;
}

const papeis = Object.values(Papel);

// GET / — lista os usuários da gestão, ativos e inativos. Ver docs/CONTRATO-API.md
// Sem paginação: a equipe de um restaurante cabe numa tela. Revisar se virar multi-restaurante.
usersRoutes.get(
  "/",
  requireAuth([Papel.ADMINISTRADOR]),
  asyncHandler(async (_req, res) => {
    const itens = await prisma.user.findMany({
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
      select: camposDoUsuario,
    });

    return res.json({ itens });
  })
);

// POST / — cria um usuário da gestão. Ver docs/CONTRATO-API.md
usersRoutes.post(
  "/",
  requireAuth([Papel.ADMINISTRADOR]),
  asyncHandler(async (req, res) => {
    const { nome, email, senha, papel, setor } = req.body ?? {};

    if (!textoValido(nome)) {
      return res.status(400).json({ erro: "nome é obrigatório", codigo: "VALIDACAO" });
    }
    if (!emailValido(email)) {
      return res.status(400).json({ erro: "e-mail inválido", codigo: "VALIDACAO" });
    }
    if (!senhaValida(senha)) {
      return res.status(400).json({
        erro: `senha deve ter ao menos ${TAMANHO_MINIMO_DA_SENHA} caracteres`,
        codigo: "VALIDACAO",
      });
    }
    if (!papeis.includes(papel)) {
      return res.status(400).json({
        erro: `papel inválido (${papeis.join(", ")})`,
        codigo: "VALIDACAO",
      });
    }

    // E-mail duplicado cai no P2002 e o errorHandler devolve 409.
    const usuario = await prisma.user.create({
      data: {
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        senhaHash: await bcrypt.hash(senha, SALT_ROUNDS),
        papel,
        setor: textoValido(setor) ? setor.trim() : null,
      },
      select: camposDoUsuario,
    });

    return res.status(201).json(usuario);
  })
);

// PATCH /:id — edita nome, e-mail, papel, setor e ativo. Ver docs/CONTRATO-API.md
usersRoutes.patch(
  "/:id",
  requireAuth([Papel.ADMINISTRADOR]),
  asyncHandler(async (req, res) => {
    const { nome, email, papel, setor, ativo } = req.body ?? {};
    const alvo = req.params.id;
    const eEuMesmo = alvo === req.usuario?.sub;

    const existe = await prisma.user.findUnique({ where: { id: alvo }, select: { id: true } });
    if (!existe) {
      return res
        .status(404)
        .json({ erro: "Usuário não encontrado", codigo: "USUARIO_NAO_ENCONTRADO" });
    }

    // Um administrador que se desativa ou se rebaixa deixa o sistema sem quem o
    // administre — e não existe outro caminho para voltar atrás pela interface.
    if (eEuMesmo && ativo === false) {
      return res.status(400).json({
        erro: "Você não pode desativar a própria conta",
        codigo: "VALIDACAO",
      });
    }
    if (eEuMesmo && papel !== undefined && papel !== Papel.ADMINISTRADOR) {
      return res.status(400).json({
        erro: "Você não pode remover o próprio acesso de administrador",
        codigo: "VALIDACAO",
      });
    }

    if (nome !== undefined && !textoValido(nome)) {
      return res.status(400).json({ erro: "nome é obrigatório", codigo: "VALIDACAO" });
    }
    if (email !== undefined && !emailValido(email)) {
      return res.status(400).json({ erro: "e-mail inválido", codigo: "VALIDACAO" });
    }
    if (papel !== undefined && !papeis.includes(papel)) {
      return res.status(400).json({
        erro: `papel inválido (${papeis.join(", ")})`,
        codigo: "VALIDACAO",
      });
    }
    if (ativo !== undefined && typeof ativo !== "boolean") {
      return res.status(400).json({ erro: "ativo deve ser booleano", codigo: "VALIDACAO" });
    }

    const atualizado = await prisma.user.update({
      where: { id: alvo },
      data: {
        ...(nome !== undefined && { nome: nome.trim() }),
        ...(email !== undefined && { email: email.trim().toLowerCase() }),
        ...(papel !== undefined && { papel }),
        ...(ativo !== undefined && { ativo }),
        // setor aceita null explícito para limpar o campo.
        ...(setor !== undefined && { setor: textoValido(setor) ? setor.trim() : null }),
      },
      select: camposDoUsuario,
    });

    return res.json(atualizado);
  })
);

// PATCH /:id/senha — administrador define uma nova senha para outro usuário.
// Não exige a senha atual de propósito: o caso de uso é justamente quem esqueceu a dela.
usersRoutes.patch(
  "/:id/senha",
  requireAuth([Papel.ADMINISTRADOR]),
  asyncHandler(async (req, res) => {
    const { novaSenha } = req.body ?? {};

    if (!senhaValida(novaSenha)) {
      return res.status(400).json({
        erro: `senha deve ter ao menos ${TAMANHO_MINIMO_DA_SENHA} caracteres`,
        codigo: "VALIDACAO",
      });
    }

    const existe = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!existe) {
      return res
        .status(404)
        .json({ erro: "Usuário não encontrado", codigo: "USUARIO_NAO_ENCONTRADO" });
    }

    await prisma.user.update({
      where: { id: req.params.id },
      data: { senhaHash: await bcrypt.hash(novaSenha, SALT_ROUNDS) },
    });

    return res.status(204).send();
  })
);
