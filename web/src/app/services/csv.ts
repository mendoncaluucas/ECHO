// Exportação CSV compartilhada pelo registro de ocorrências e pelos relatórios.

export type Celula = string | number | null | undefined;

// Aspas duplicadas e o valor entre aspas. Comentário de cliente vem com vírgula,
// aspas e quebra de linha — sem isso o arquivo abre torto no Excel.
function celula(valor: Celula) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return `"${texto.replace(/"/g, '""')}"`;
}

// Ponto e vírgula e BOM: é o que o Excel em português espera. Com vírgula ele joga
// a linha inteira numa coluna só, e sem o BOM os acentos saem quebrados.
export function montarCsv(linhas: Celula[][]) {
  return '﻿' + linhas.map((linha) => linha.map(celula).join(';')).join('\r\n');
}

// Número decimal com vírgula, como o Excel em português lê. "4.2" viraria texto
// (ou, pior, data) e não entraria em fórmula.
export function decimal(valor: number | null | undefined) {
  return valor === null || valor === undefined ? '' : String(valor).replace('.', ',');
}

export function baixarCsv(nome: string, conteudo: string) {
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
}
