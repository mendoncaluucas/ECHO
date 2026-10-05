// Leitura de parâmetros de query compartilhada pelas listagens paginadas
// (ocorrências e auditoria). Cada leitor devolve `null` para valor malformado,
// para a rota responder 400 em vez de ignorar o filtro em silêncio.

export const POR_PAGINA_PADRAO = 20;
export const POR_PAGINA_MAXIMO = 100;

export function lerInteiro(valor: unknown, padrao: number, minimo: number, maximo: number) {
  if (valor === undefined) return padrao;
  if (typeof valor !== "string" || !/^\d+$/.test(valor)) return null;

  const numero = Number(valor);
  return numero >= minimo && numero <= maximo ? numero : null;
}

// Aceita uma data no formato YYYY-MM-DD. `fimDoDia` empurra para o último instante,
// senão filtrar "até 30/09" excluiria tudo que aconteceu durante o dia 30.
export function lerData(valor: unknown, fimDoDia = false): Date | null | undefined {
  if (valor === undefined || valor === "") return undefined;
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;

  const data = new Date(`${valor}T${fimDoDia ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(data.getTime()) ? null : data;
}

// Lê `pagina` e `porPagina` juntos; `null` se qualquer um vier malformado.
export function lerPaginacao(query: Record<string, unknown>) {
  const pagina = lerInteiro(query.pagina, 1, 1, Number.MAX_SAFE_INTEGER);
  const porPagina = lerInteiro(query.porPagina, POR_PAGINA_PADRAO, 1, POR_PAGINA_MAXIMO);
  return pagina === null || porPagina === null ? null : { pagina, porPagina };
}

export const ERRO_DE_PAGINACAO = {
  erro: `pagina deve ser inteiro positivo e porPagina um inteiro de 1 a ${POR_PAGINA_MAXIMO}`,
  codigo: "VALIDACAO",
} as const;
