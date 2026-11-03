import jwt from "jsonwebtoken";
import type { Papel } from "@prisma/client";
import { DURACAO_SESSAO_MAXIMA_HORAS } from "./configuracao.js";

// Segredo obrigatório: falhar já na carga do módulo evita subir a API com a
// autenticação silenciosamente quebrada.
function lerJwtSecret(): string {
  const segredo = process.env.JWT_SECRET;
  if (!segredo) {
    throw new Error(
      "JWT_SECRET não definido. Copie o .env.example para .env e preencha a variável."
    );
  }
  return segredo;
}

const JWT_SECRET = lerJwtSecret();

// Dados que viajam dentro do token. `sub` é o id do usuário (claim padrão do JWT).
export type PayloadToken = { sub: string; papel: Papel };

// O token sai sempre com o teto (24h), não com a duração configurada. Quem decide
// se a sessão ainda vale é o requireAuth, comparando a idade dela com a configuração
// atual. Se a duração fosse gravada aqui, encurtá-la não derrubaria as sessões já
// abertas, e o administrador que encurta por segurança acharia que encurtou.
//
// `versaoDaSessao` é a do usuário agora (User.versaoDaSessao): trocar a senha muda o
// número, e o requireAuth recusa os tokens com o antigo. Sem valor padrão de propósito,
// para nenhum ponto que assina esquecer de passar.
export function assinarToken(payload: PayloadToken, versaoDaSessao: number): string {
  return jwt.sign({ ...payload, v: versaoDaSessao }, JWT_SECRET, {
    expiresIn: `${DURACAO_SESSAO_MAXIMA_HORAS}h`,
  });
}

// Lança se o token for inválido, adulterado ou expirado — quem chama trata.
// `emitidoEm` é o iat em milissegundos, para o requireAuth medir a idade da sessão.
// Token de antes do `v` (assinado até 03/11) conta como versão 0, a de todo usuário
// que ainda não trocou a senha: o deploy não derruba ninguém.
export function verificarToken(token: string): PayloadToken & { emitidoEm: number; versaoDaSessao: number } {
  const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
  return {
    sub: String(payload.sub),
    papel: payload.papel as Papel,
    emitidoEm: (payload.iat ?? 0) * 1000,
    versaoDaSessao: Number.isInteger(payload.v) ? (payload.v as number) : 0,
  };
}
