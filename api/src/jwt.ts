import jwt from "jsonwebtoken";
import type { Papel } from "@prisma/client";

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
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "8h";

// Dados que viajam dentro do token. `sub` é o id do usuário (claim padrão do JWT).
export type PayloadToken = { sub: string; papel: Papel };

export function assinarToken(payload: PayloadToken): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

// Lança se o token for inválido, adulterado ou expirado — quem chama trata.
export function verificarToken(token: string): PayloadToken {
  const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
  return { sub: String(payload.sub), papel: payload.papel as Papel };
}
