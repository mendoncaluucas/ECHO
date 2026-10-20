import { describe, expect, it } from 'vitest';
import { haQuanto, numeroBr, primeiroNome, saudacao } from './rotulos';

// Datas no fuso de quem roda o teste, como na tela (o navegador usa o do aparelho).
const em = (dia: number, hora: number, minuto = 0, segundo = 0) =>
  new Date(2026, 9, dia, hora, minuto, segundo);

describe('há quanto tempo chegou', () => {
  const agora = em(15, 14, 0);

  it.each([
    ['30 s antes', em(15, 13, 59, 30), 'agora há pouco'],
    ['1 min antes', em(15, 13, 59), 'há 1 min'],
    ['25 min antes', em(15, 13, 35), 'há 25 min'],
    ['hoje de manhã', em(15, 9, 0), 'há 5 h'],
    ['ontem de manhã', em(14, 9, 0), 'ontem'],
    ['três dias antes', em(12, 9, 0), 'há 3 dias'],
    ['seis dias antes', em(9, 14, 0), 'há 6 dias'],
  ])('%s → %s', (_, quando, esperado) => {
    expect(haQuanto(quando.toISOString(), agora)).toBe(esperado);
  });

  it('dias pelo calendário: o que chegou às 23h de ontem é "ontem" à 1h de hoje', () => {
    expect(haQuanto(em(14, 23, 0).toISOString(), em(15, 1, 0))).toBe('ontem');
  });

  it('passada uma semana, a data, e não "há 23 dias"', () => {
    expect(haQuanto(em(8, 14, 0).toISOString(), agora)).toBe(
      em(8, 14, 0).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
    );
  });
});

describe('outros rótulos', () => {
  it('número no formato brasileiro, inteiro sem vírgula', () => {
    expect(numeroBr(17.44)).toBe('17,4');
    expect(numeroBr(4)).toBe('4');
    expect(numeroBr(1234.5)).toBe('1.234,5');
  });

  it('saudação pela hora', () => {
    expect(saudacao(em(15, 4, 59))).toBe('Boa noite');
    expect(saudacao(em(15, 5, 0))).toBe('Bom dia');
    expect(saudacao(em(15, 12, 0))).toBe('Boa tarde');
    expect(saudacao(em(15, 18, 0))).toBe('Boa noite');
  });

  it('primeiro nome, com plano B para nome vazio', () => {
    expect(primeiroNome('  Ana   Paula Souza ')).toBe('Ana');
    expect(primeiroNome('')).toBe('equipe');
    expect(primeiroNome(null)).toBe('equipe');
  });
});
