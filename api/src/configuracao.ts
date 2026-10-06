import { prisma } from "./prisma.js";

// Configurações do sistema, numa linha única de id fixo. Ver docs/MODELO-DADOS.md

export const ID_DA_CONFIGURACAO = "sistema";

export const DURACAO_SESSAO_MINIMA_HORAS = 1;
// Teto da sessão e validade gravada em todo token. Ver o requireAuth.
export const DURACAO_SESSAO_MAXIMA_HORAS = 24;

// Iguais aos @default do schema: valem enquanto ninguém salvou nada, e a linha
// ainda não existe no banco.
const PADRAO = { duracaoSessaoHoras: 8 };

export type Configuracoes = typeof PADRAO;

export async function lerConfiguracoes(): Promise<Configuracoes> {
  const linha = await prisma.configuracao.findUnique({
    where: { id: ID_DA_CONFIGURACAO },
    select: { duracaoSessaoHoras: true },
  });
  return linha ?? PADRAO;
}
