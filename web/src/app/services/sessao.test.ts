import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EVENTO_SESSAO_ATUALIZADA,
  atualizarUsuarioDaSessao,
  encerrarSessao,
  idadeDaSessaoEmHoras,
  salvarSessao,
  sessaoAtual,
  tokenDaSessao,
  usuarioLogado,
} from './api';
import { USUARIOS, tokenFalso } from '../../test/apiFalsa';

const gerente = USUARIOS.GERENTE;

// Grava o que a tela escreve em document.cookie, para conferir os atributos (que a
// leitura de document.cookie não mostra), e deixa o cookie seguir para o jsdom.
function espiarCookies({ bloqueados = false } = {}) {
  const original = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
  const escritas: string[] = [];
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => (bloqueados ? '' : original.get!.call(document)),
    set: (valor: string) => {
      escritas.push(valor);
      if (!bloqueados) original.set!.call(document, valor);
    },
  });
  return escritas;
}

afterEach(() => {
  // Volta ao cookie de verdade (o do protótipo).
  delete (document as { cookie?: string }).cookie;
});

describe('sessão sem "Manter conectado" (o padrão)', () => {
  it('fica num cookie que o navegador apaga ao fechar, e não no localStorage', () => {
    const escritas = espiarCookies();
    salvarSessao('tok-1', gerente, false);

    const gravacao = escritas.find((c) => c.startsWith('echo_sessao=') && !c.includes('Max-Age=0'));
    expect(gravacao).toBeDefined();
    // Sem data de validade: é isso que faz fechar o navegador encerrar a sessão.
    expect(gravacao).not.toMatch(/expires|max-age/i);
    expect(gravacao).toContain('SameSite=Strict');
    // Em http (localhost) não pode ter Secure, senão o navegador recusa o cookie.
    expect(gravacao).not.toContain('Secure');

    expect(localStorage.getItem('echo_token')).toBeNull();
    expect(sessaoAtual()).toEqual({ token: 'tok-1', usuario: gerente });
    expect(tokenDaSessao()).toBe('tok-1');
  });

  it('cookies bloqueados: o login acusa, em vez de "entrar" e voltar para a entrada', () => {
    espiarCookies({ bloqueados: true });
    expect(() => salvarSessao('tok-1', gerente, false)).toThrow(
      expect.objectContaining({ codigo: 'SESSAO_NAO_GRAVADA' })
    );
  });
});

describe('sessão com "Manter conectado"', () => {
  it('fica no localStorage e não deixa cookie', () => {
    salvarSessao('tok-2', gerente, true);
    expect(localStorage.getItem('echo_token')).toBe('tok-2');
    expect(JSON.parse(localStorage.getItem('echo_usuario')!)).toEqual(gerente);
    expect(document.cookie).not.toContain('echo_sessao=');
    expect(sessaoAtual()).toEqual({ token: 'tok-2', usuario: gerente });
  });

  it('armazenamento bloqueado: o login acusa', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => salvarSessao('tok-2', gerente, true)).toThrow(
      expect.objectContaining({ codigo: 'SESSAO_NAO_GRAVADA' })
    );
  });
});

describe('uma sessão só', () => {
  it('entrar de novo no outro modo apaga a sessão anterior', () => {
    salvarSessao('tok-antigo', USUARIOS.ADMINISTRADOR, true);
    salvarSessao('tok-novo', gerente, false);
    // Duas ao mesmo tempo, e não se saberia qual vale (o localStorage ganharia).
    expect(localStorage.getItem('echo_token')).toBeNull();
    expect(sessaoAtual()?.token).toBe('tok-novo');

    salvarSessao('tok-terceiro', gerente, true);
    expect(document.cookie).not.toContain('echo_sessao=');
    expect(sessaoAtual()?.token).toBe('tok-terceiro');
  });

  it('sair apaga dos dois lugares, inclusive a chave dos logins antigos', () => {
    salvarSessao('tok', gerente, true);
    localStorage.setItem('userRole', 'GERENTE');
    document.cookie = 'echo_sessao=' + encodeURIComponent(JSON.stringify({ token: 'x', usuario: gerente })) + '; Path=/';

    encerrarSessao();

    expect(sessaoAtual()).toBeNull();
    expect(localStorage.getItem('userRole')).toBeNull();
    expect(document.cookie).not.toContain('echo_sessao=');
  });

  it('meia sessão não vale: token sem usuário', () => {
    localStorage.setItem('echo_token', 'tok-sozinho');
    expect(sessaoAtual()).toBeNull();
  });

  it('cookie estragado não derruba a tela', () => {
    document.cookie = 'echo_sessao=%7Bnao-e-json; Path=/';
    expect(sessaoAtual()).toBeNull();
  });
});

describe('o administrador edita a própria conta', () => {
  it('sem "Manter conectado": o nome muda no cookie, e o token e o modo ficam', () => {
    salvarSessao('tok', USUARIOS.ADMINISTRADOR, false);
    const avisos = vi.fn();
    window.addEventListener(EVENTO_SESSAO_ATUALIZADA, avisos);

    atualizarUsuarioDaSessao({ nome: 'Administradora Nova' });

    expect(sessaoAtual()).toEqual({
      token: 'tok',
      usuario: { ...USUARIOS.ADMINISTRADOR, nome: 'Administradora Nova' },
    });
    expect(localStorage.getItem('echo_token')).toBeNull();
    expect(avisos).toHaveBeenCalledOnce();
    window.removeEventListener(EVENTO_SESSAO_ATUALIZADA, avisos);
  });

  it('com "Manter conectado": o nome muda no localStorage, sem criar cookie', () => {
    salvarSessao('tok', USUARIOS.ADMINISTRADOR, true);
    atualizarUsuarioDaSessao({ nome: 'Administradora Nova' });

    expect(usuarioLogado()?.nome).toBe('Administradora Nova');
    expect(localStorage.getItem('echo_token')).toBe('tok');
    expect(document.cookie).not.toContain('echo_sessao=');
  });

  it('sem sessão não grava nada nem avisa', () => {
    const avisos = vi.fn();
    window.addEventListener(EVENTO_SESSAO_ATUALIZADA, avisos);
    atualizarUsuarioDaSessao({ nome: 'Ninguém' });
    expect(sessaoAtual()).toBeNull();
    expect(avisos).not.toHaveBeenCalled();
    window.removeEventListener(EVENTO_SESSAO_ATUALIZADA, avisos);
  });
});

describe('idade da sessão (aviso de sessão perto de vencer)', () => {
  it('lê a hora de emissão do token', () => {
    salvarSessao(tokenFalso(3), gerente, false);
    expect(idadeDaSessaoEmHoras()).toBeCloseTo(3, 1);
  });

  it('token sem o formato esperado dá null, sem quebrar', () => {
    salvarSessao('nao-e-jwt', gerente, false);
    expect(idadeDaSessaoEmHoras()).toBeNull();
  });
});
