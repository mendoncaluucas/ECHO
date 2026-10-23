import { prisma } from "./prisma.js";

// Configurações do sistema, numa linha única de id fixo. Ver docs/MODELO-DADOS.md

export const ID_DA_CONFIGURACAO = "sistema";

export const DURACAO_SESSAO_MINIMA_HORAS = 1;
// Teto da sessão e validade gravada em todo token. Ver o requireAuth.
export const DURACAO_SESSAO_MAXIMA_HORAS = 24;

// Campos que o administrador edita, cada um com a faixa aceita. Os prazos de retenção
// (LGPD) são em dias. Os tetos impedem "guardar para sempre" por engano; os pisos, que
// um contato suma antes de a equipe ter tempo de responder.
export const LIMITES = {
  duracaoSessaoHoras: { min: DURACAO_SESSAO_MINIMA_HORAS, max: DURACAO_SESSAO_MAXIMA_HORAS },
  retencaoContatoDias: { min: 30, max: 365 },
  retencaoComentarioDias: { min: 30, max: 1825 },
  retencaoNotificacaoDias: { min: 7, max: 365 },
} as const;

export type CampoEditavel = keyof typeof LIMITES;
export const CAMPOS_EDITAVEIS = Object.keys(LIMITES) as CampoEditavel[];

// Iguais aos @default do schema: valem enquanto ninguém salvou nada, e a linha
// ainda não existe no banco.
const PADRAO = {
  duracaoSessaoHoras: 8,
  retencaoContatoDias: 90,
  retencaoComentarioDias: 365,
  retencaoNotificacaoDias: 90,
  ultimaRetencaoEm: null as Date | null,
};

export type Configuracoes = typeof PADRAO;

export async function lerConfiguracoes(): Promise<Configuracoes> {
  const linha = await prisma.configuracao.findUnique({
    where: { id: ID_DA_CONFIGURACAO },
    select: {
      duracaoSessaoHoras: true,
      retencaoContatoDias: true,
      retencaoComentarioDias: true,
      retencaoNotificacaoDias: true,
      ultimaRetencaoEm: true,
    },
  });
  return linha ?? PADRAO;
}
