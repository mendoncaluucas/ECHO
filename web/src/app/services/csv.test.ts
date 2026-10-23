import { describe, expect, it } from 'vitest';
import { montarCsv } from './csv';

// A planilha que o gerente abre no Excel.
const celulas = (csv: string) => csv.replace(/^﻿/, '').split(';');

describe('exportação CSV', () => {
  it('abre certo no Excel em português: BOM, ponto e vírgula e aspas', () => {
    const csv = montarCsv([['Mesa 1', 'disse "ótimo", e voltou']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(celulas(csv)).toEqual(['"Mesa 1"', '"disse ""ótimo"", e voltou"']);
  });

  it.each([
    '=HYPERLINK("http://site-falso","Clique aqui")',
    '+1+1',
    '-2+3',
    '@SUM(A1:A2)',
    '\t=1+1',
    '\r=1+1',
  ])('comentário que o Excel leria como fórmula vira texto: %j', (comentario) => {
    const [celula] = celulas(montarCsv([[comentario]]));
    expect(celula.startsWith(`"'`)).toBe(true);
  });

  it.each(['-0,5', '-12', '-3.25', 'ótimo atendimento', 'a=b no meio não é fórmula', ''])(
    'o resto fica como está: %j',
    (valor) => {
      const [celula] = celulas(montarCsv([[valor]]));
      expect(celula).toBe(`"${valor}"`);
    }
  );

  it('números e vazios', () => {
    expect(celulas(montarCsv([[4, null, undefined, -1]]))).toEqual(['"4"', '""', '""', '"-1"']);
  });
});
