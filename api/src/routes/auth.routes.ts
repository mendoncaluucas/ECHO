import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth } from "../middlewares/auth.js";
import { assinarToken } from "../jwt.js";
import { registrarAuditoria } from "../auditoria.js";
import { senhaValida, TAMANHO_MINIMO_DA_SENHA } from "./users.routes.js";
import { limiteDaTrocaDeSenha, limiteDoLoginPorEmail, limiteDoLoginPorIp } from "../limites.js";

// Autenticação da gestão — DONO: Victor
export const authRoutes = Router();

// Hash descartável usado quando o e-mail não existe: mantém o tempo de resposta
// parecido com o de uma senha errada, para não revelar quais e-mails têm cadastro.
const HASH_FICTICIO = bcrypt.hashSync("senha-que-nunca-confere", 10);

// POST /login — autentica a gestão e devolve o JWT. Ver docs/CONTRATO-API.md
// Com limite de tentativas por IP e por e-mail (src/limites.ts).
authRoutes.post(
  "/login",
  limiteDoLoginPorIp,
  limiteDoLoginPorEmail,
  asyncHandler(async (req, res) => {
    const { email, senha } = req.body ?? {};

    if (typeof email !== "string" || email.length === 0) {
      return res.status(400).json({ erro: "email é obrigatório", codigo: "VALIDACAO" });
    }
    if (typeof senha !== "string" || senha.length === 0) {
      return res.status(400).json({ erro: "senha é obrigatória", codigo: "VALIDACAO" });
    }

    const usuario = await prisma.user.findUnique({ where: { email } });
    const senhaConfere = await bcrypt.compare(senha, usuario?.senhaHash ?? HASH_FICTICIO);

    // Resposta idêntica para e-mail inexistente, senha errada e conta desativada:
    // não revelar quem tem cadastro nem quem foi desligado da equipe.
    if (!usuario || !senhaConfere || !usuario.ativo) {
      return res
        .status(401)
        .json({ erro: "Credenciais inválidas", codigo: "CREDENCIAIS_INVALIDAS" });
    }

    // Só o login bem-sucedido entra no log. A tentativa falha não tem autor
    // identificável, e gravar o e-mail digitado guardaria endereço de quem nem tem
    // conta: qualquer um encheria a tabela trocando de IP.
    await registrarAuditoria(prisma, {
      acao: "LOGIN",
      usuarioId: usuario.id,
      entidade: "User",
      entidadeId: usuario.id,
    });

    return res.json({
      token: assinarToken({ sub: usuario.id, papel: usuario.papel }, usuario.versaoDaSessao),
      usuario: { id: usuario.id, nome: usuario.nome, papel: usuario.papel },
    });
  })
);

// PATCH /senha — o usuário troca a própria senha. Qualquer papel autenticado.
// Fica aqui, e não em /users, porque não é administração de terceiros: é a credencial
// de quem está logado, e por isso exige a senha atual.
//
// Derruba as outras sessões da pessoa (versaoDaSessao + 1) e devolve um token novo para
// esta continuar. Com limite de senhas atuais erradas: sem ele, quem roubasse um token
// testaria senhas por aqui, por fora do limite do login.
authRoutes.patch(
  "/senha",
  requireAuth([]),
  limiteDaTrocaDeSenha,
  asyncHandler(async (req, res) => {
    const { senhaAtual, novaSenha } = req.body ?? {};

    if (typeof senhaAtual !== "string" || senhaAtual.length === 0) {
      return res.status(400).json({ erro: "senhaAtual é obrigatória", codigo: "VALIDACAO" });
    }
    if (!senhaValida(novaSenha)) {
      return res.status(400).json({
        erro: `novaSenha deve ter ao menos ${TAMANHO_MINIMO_DA_SENHA} caracteres`,
        codigo: "VALIDACAO",
      });
    }

    const usuario = await prisma.user.findUnique({ where: { id: req.usuario!.sub } });
    if (!usuario || !(await bcrypt.compare(senhaAtual, usuario.senhaHash))) {
      return res
        .status(401)
        .json({ erro: "Senha atual incorreta", codigo: "CREDENCIAIS_INVALIDAS" });
    }

    // Depois de conferir a atual: antes, a resposta diria que a senha digitada é a certa.
    if (novaSenha === senhaAtual) {
      return res
        .status(400)
        .json({ erro: "A nova senha precisa ser diferente da atual", codigo: "VALIDACAO" });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 10);
    const atualizado = await prisma.$transaction(async (tx) => {
      const salvo = await tx.user.update({
        where: { id: usuario.id },
        data: { senhaHash, versaoDaSessao: { increment: 1 } },
        select: { id: true, papel: true, versaoDaSessao: true },
      });
      await registrarAuditoria(tx, {
        acao: "SENHA_ALTERADA",
        usuarioId: usuario.id,
        entidade: "User",
        entidadeId: usuario.id,
      });
      return salvo;
    });

    return res.json({
      token: assinarToken({ sub: atualizado.id, papel: atualizado.papel }, atualizado.versaoDaSessao),
    });
  })
);
