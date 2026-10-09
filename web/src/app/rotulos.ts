import type { StatusOcorrencia, TipoFeedback } from './services/api';

// Nome e cor de tipo e status num lugar só. Cada tela tinha a sua cópia, e elas já
// divergiam: o "Pendente" era cinza no painel e vermelho no menu. As telas antigas
// passam a usar daqui conforme forem redesenhadas.
//
// Classes inteiras: o Tailwind só gera o que encontra escrito, nunca montado em
// tempo de execução.

export const ROTULO_TIPO: Record<TipoFeedback, string> = {
  ELOGIO: 'Elogio',
  SUGESTAO: 'Sugestão',
  RECLAMACAO: 'Reclamação',
};

export const COR_DO_TIPO: Record<TipoFeedback, string> = {
  ELOGIO: 'bg-tipo-elogio',
  SUGESTAO: 'bg-tipo-sugestao',
  RECLAMACAO: 'bg-tipo-reclamacao',
};

export const ROTULO_STATUS: Record<StatusOcorrencia, string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  RESOLVIDO: 'Resolvido',
};

export const SELO_DO_STATUS: Record<StatusOcorrencia, string> = {
  PENDENTE: 'bg-perigo-fundo text-perigo',
  EM_ANDAMENTO: 'bg-andamento-fundo text-andamento',
  RESOLVIDO: 'bg-accent text-accent-foreground',
};

// O enum do backend pode crescer antes de um deploy do front: valor desconhecido
// aparece cru e neutro em vez de quebrar a tela.
export const rotuloDoTipo = (tipo: string) => ROTULO_TIPO[tipo as TipoFeedback] ?? tipo;
export const corDoTipo = (tipo: string) => COR_DO_TIPO[tipo as TipoFeedback] ?? 'bg-muted-foreground';
export const rotuloDoStatus = (status: string) =>
  ROTULO_STATUS[status as StatusOcorrencia] ?? status;
export const seloDoStatus = (status: string) =>
  SELO_DO_STATUS[status as StatusOcorrencia] ?? 'bg-muted text-muted-foreground';

// 17.4 → "17,4". Inteiros saem sem vírgula.
export function numeroBr(valor: number, casas = 1) {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

// "há 5 min", "ontem", "há 3 dias". Passada uma semana, a data: "há 23 dias" obriga a
// fazer conta para saber quando foi.
export function haQuanto(iso: string, agora: Date = new Date()): string {
  const quando = new Date(iso);
  const passou = agora.getTime() - quando.getTime();

  if (passou < MINUTO) return 'agora há pouco';
  if (passou < HORA) return `há ${Math.floor(passou / MINUTO)} min`;

  // Dias contados pelo calendário, não por 24h: o que chegou às 23h de ontem é "ontem"
  // à 1h de hoje, mesmo que tenham passado só 2 horas.
  const meiaNoite = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((meiaNoite(agora) - meiaNoite(quando)) / DIA);

  if (dias <= 0) return `há ${Math.floor(passou / HORA)} h`;
  if (dias === 1) return 'ontem';
  if (dias < 7) return `há ${dias} dias`;
  return quando.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

export function saudacao(agora: Date = new Date()) {
  const hora = agora.getHours();
  if (hora >= 5 && hora < 12) return 'Bom dia';
  if (hora >= 12 && hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function primeiroNome(nome: string | null | undefined) {
  return nome?.trim().split(/\s+/)[0] || 'equipe';
}
