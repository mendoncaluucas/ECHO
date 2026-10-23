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
  if (Number.isNaN(data.getTime())) return null;

  // O JavaScript aceita dia que não existe e rola em silêncio: 2026-02-31 vira 3 de
  // março. Se a data montada não devolve o mesmo ano, mês e dia, ela não existe.
  const [ano, mes, dia] = valor.split("-").map(Number);
  const existe =
    data.getFullYear() === ano && data.getMonth() + 1 === mes && data.getDate() === dia;
  return existe ? data : null;
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

// Texto para comparar com `mode: "insensitive"` do Prisma (equals ou contains). No
// Postgres ele vira ILIKE, e o Prisma não escapa nada: "_" valia por qualquer letra e
// "%" por qualquer texto, e uma barra invertida sumia (era o escape). Visto em teste:
// a área "Mesa_1" era recusada porque já havia "Mesa 1", e a busca "%" trazia tudo.
// A barra é o escape padrão do ILIKE, então barra, "%" e "_" ganham uma barra antes.
// Se o Prisma um dia passar a escapar por conta própria, tests/curingas.test.ts acusa.
export function semCuringas(texto: string) {
  return texto.replace(/[\\%_]/g, "\\$&");
}
