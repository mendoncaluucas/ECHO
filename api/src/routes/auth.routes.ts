import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { assinarToken } from "../jwt.js";

// Autenticação da gestão — DONO: Victor
export const authRoutes = Router();

// Hash descartável usado quando o e-mail não existe: mantém o tempo de resposta
// parecido com o de uma senha errada, para não revelar quais e-mails têm cadastro.
const HASH_FICTICIO = bcrypt.hashSync("senha-que-nunca-confere", 10);

// POST /login — autentica a gestão e devolve o JWT. Ver docs/CONTRATO-API.md
authRoutes.post(
  "/login",
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

    // Resposta idêntica para e-mail inexistente e senha errada: não revelar quem tem cadastro.
    if (!usuario || !senhaConfere) {
      return res
        .status(401)
        .json({ erro: "Credenciais inválidas", codigo: "CREDENCIAIS_INVALIDAS" });
    }

    return res.json({
      token: assinarToken({ sub: usuario.id, papel: usuario.papel }),
      usuario: { id: usuario.id, nome: usuario.nome, papel: usuario.papel },
    });
  })
);
