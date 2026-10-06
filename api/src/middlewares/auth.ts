import type { Request, Response, NextFunction } from "express";
import type { Papel } from "@prisma/client";
import { prisma } from "../prisma.js";
import { verificarToken, type PayloadToken } from "../jwt.js";
import { lerConfiguracoes } from "../configuracao.js";

const MS_POR_HORA = 60 * 60 * 1000;

// Disponibiliza req.usuario nos handlers que rodam depois do requireAuth.
declare module "express-serve-static-core" {
  interface Request {
    usuario?: PayloadToken;
  }
}

// Middleware de autenticação/autorização (RBAC) — DONO: Victor
//
// Uso:
//   router.get("/", requireAuth([Papel.GERENTE, Papel.ADMINISTRADOR]), handler)
//
// Lista vazia exige apenas estar autenticado, sem restrição de papel.
export function requireAuth(papeisPermitidos: Papel[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const [esquema, token] = (req.headers.authorization ?? "").split(" ");

    if (esquema !== "Bearer" || !token) {
      return res
        .status(401)
        .json({ erro: "Token não informado", codigo: "NAO_AUTENTICADO" });
    }

    let payload: ReturnType<typeof verificarToken>;
    try {
      payload = verificarToken(token);
    } catch {
      return res
        .status(401)
        .json({ erro: "Token inválido ou expirado", codigo: "TOKEN_INVALIDO" });
    }

    try {
      // O papel e a situação vêm do banco, não do token. O token vale horas; sem esta
      // consulta, desativar ou rebaixar alguém só teria efeito quando ele expirasse —
      // e um administrador rebaixado se promoveria de volta dentro dessa janela.
      const [atual, configuracoes] = await Promise.all([
        prisma.user.findUnique({
          where: { id: payload.sub },
          select: { papel: true, ativo: true },
        }),
        lerConfiguracoes(),
      ]);

      if (!atual || !atual.ativo) {
        return res
          .status(401)
          .json({ erro: "Sessão encerrada", codigo: "TOKEN_INVALIDO" });
      }

      // A duração da sessão é a configurada agora, não a da hora do login: o token
      // sai sempre com o teto (ver jwt.ts). Encurtar derruba na hora as sessões mais
      // velhas que o novo limite; alongar estende as abertas, até o teto.
      const idadeDaSessao = Date.now() - payload.emitidoEm;
      if (idadeDaSessao > configuracoes.duracaoSessaoHoras * MS_POR_HORA) {
        return res
          .status(401)
          .json({ erro: "Sessão expirada", codigo: "TOKEN_INVALIDO" });
      }

      if (papeisPermitidos.length > 0 && !papeisPermitidos.includes(atual.papel)) {
        return res
          .status(403)
          .json({ erro: "Sem permissão para este recurso", codigo: "SEM_PERMISSAO" });
      }

      req.usuario = { sub: payload.sub, papel: atual.papel };
      return next();
    } catch (erro) {
      // Middleware async: o Express 4 não captura rejeição sozinho.
      return next(erro);
    }
  };
}
