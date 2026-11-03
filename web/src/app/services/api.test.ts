import { describe, expect, it, vi } from 'vitest';
import {
  EVENTO_SESSAO_ENCERRADA,
  getVenue,
  lerAvisoDoLogin,
  listarOcorrencias,
  login,
  sessaoAtual,
  tokenDaSessao,
  trocarTokenDaSessao,
} from './api';
import { apiFalsa, entrarComo } from '../../test/apiFalsa';

function ouvirSessaoEncerrada() {
  const ouvinte = vi.fn();
  window.addEventListener(EVENTO_SESSAO_ENCERRADA, ouvinte);
  return {
    ouvinte,
    parar: () => window.removeEventListener(EVENTO_SESSAO_ENCERRADA, ouvinte),
  };
}

describe('pedidos à API', () => {
  it('API fora do ar: mensagem para gente, não o "Failed to fetch" do navegador', async () => {
    apiFalsa().quando('GET /public/venue/MESA12', 'sem-rede');
    await expect(getVenue('MESA12')).rejects.toMatchObject({
      message: 'Não foi possível conectar ao servidor. Tente novamente em alguns instantes.',
      codigo: 'SEM_CONEXAO',
    });
  });

  it('erro da API chega à tela com a mensagem, o status e o código dela', async () => {
    apiFalsa().quando('GET /public/venue/VELHO', {
      status: 404,
      corpo: { erro: 'QR Code não encontrado.', codigo: 'QR_INVALIDO' },
    });
    await expect(getVenue('VELHO')).rejects.toMatchObject({
      message: 'QR Code não encontrado.',
      status: 404,
      codigo: 'QR_INVALIDO',
    });
  });

  it('o token da mesa vai codificado no caminho', async () => {
    const api = apiFalsa().quando('*', { corpo: {} });
    await getVenue('a/b c');
    expect(api.pedidos[0].caminho).toBe('/public/venue/a%2Fb%20c');
  });

  it('filtros vazios não vão para a busca', async () => {
    const api = apiFalsa().quando('GET /occurrences', { corpo: { itens: [], total: 0 } });
    await listarOcorrencias('tok', { pagina: 2, status: 'PENDENTE', tipo: undefined, categoria: '' });
    const { busca, autorizacao } = api.pedidos[0];
    expect(Object.fromEntries(busca)).toEqual({ pagina: '2', status: 'PENDENTE' });
    expect(autorizacao).toBe('Bearer tok');
  });
});

describe('sessão vencida no meio do uso', () => {
  it.each(['TOKEN_INVALIDO', 'NAO_AUTENTICADO'])(
    '401 %s com token: encerra a sessão, deixa o aviso para o login e avisa o app',
    async (codigo) => {
      entrarComo('GERENTE');
      apiFalsa().quando('GET /occurrences', { status: 401, corpo: { erro: 'Sessão inválida.', codigo } });
      const { ouvinte, parar } = ouvirSessaoEncerrada();

      await expect(listarOcorrencias(tokenDaSessao()!)).rejects.toMatchObject({ status: 401 });

      expect(sessaoAtual()).toBeNull();
      expect(lerAvisoDoLogin()).toBe('Sua sessão terminou. Entre de novo para continuar.');
      expect(ouvinte).toHaveBeenCalledOnce();
      parar();
    }
  );

  it('401 de um token que já foi trocado (outra aba, pedido a caminho na troca de senha): refaz com o atual, sem deslogar', async () => {
    entrarComo('GERENTE');
    const antigo = tokenDaSessao()!;
    trocarTokenDaSessao('token-novo-da-troca');
    const api = apiFalsa().quando('GET /occurrences', (p) =>
      p.autorizacao === 'Bearer token-novo-da-troca'
        ? { corpo: { itens: [], total: 3 } }
        : { status: 401, corpo: { erro: 'Sessão encerrada: a senha foi trocada', codigo: 'TOKEN_INVALIDO' } }
    );
    const { ouvinte, parar } = ouvirSessaoEncerrada();

    await expect(listarOcorrencias(antigo)).resolves.toMatchObject({ total: 3 });

    expect(api.pedidosPara('GET', '/occurrences').map((p) => p.autorizacao)).toEqual([
      `Bearer ${antigo}`,
      'Bearer token-novo-da-troca',
    ]);
    expect(tokenDaSessao()).toBe('token-novo-da-troca');
    expect(ouvinte).not.toHaveBeenCalled();
    parar();
  });

  it('se o token atual também for recusado, aí sim a sessão terminou (e não refaz sem fim)', async () => {
    entrarComo('GERENTE');
    const antigo = tokenDaSessao()!;
    trocarTokenDaSessao('token-novo-da-troca');
    const api = apiFalsa().quando('GET /occurrences', {
      status: 401,
      corpo: { erro: 'Sessão encerrada', codigo: 'TOKEN_INVALIDO' },
    });
    const { ouvinte, parar } = ouvirSessaoEncerrada();

    await expect(listarOcorrencias(antigo)).rejects.toMatchObject({ status: 401 });

    expect(api.pedidosPara('GET', '/occurrences')).toHaveLength(2);
    expect(sessaoAtual()).toBeNull();
    expect(ouvinte).toHaveBeenCalledOnce();
    parar();
  });

  it('401 de sessão sem sessão nenhuma no navegador (saiu em outra aba): leva ao login, sem refazer', async () => {
    const api = apiFalsa().quando('GET /occurrences', {
      status: 401,
      corpo: { erro: 'Sessão encerrada', codigo: 'TOKEN_INVALIDO' },
    });
    const { ouvinte, parar } = ouvirSessaoEncerrada();

    await expect(listarOcorrencias('token-de-uma-sessao-que-saiu')).rejects.toMatchObject({ status: 401 });

    expect(api.pedidosPara('GET', '/occurrences')).toHaveLength(1);
    expect(ouvinte).toHaveBeenCalledOnce();
    parar();
  });

  it.each([false, true])('trocar o token mantém o usuário e o lugar da sessão (manter conectado: %s)', (manter) => {
    entrarComo('COORDENADOR', manter);
    const usuario = sessaoAtual()!.usuario;

    trocarTokenDaSessao('token-novo');

    expect(sessaoAtual()).toEqual({ token: 'token-novo', usuario });
    expect(Boolean(localStorage.getItem('echo_token'))).toBe(manter);
  });

  it('sem sessão, trocar o token não cria uma', () => {
    trocarTokenDaSessao('token-novo');
    expect(sessaoAtual()).toBeNull();
  });

  it('outro 401 com token (ex.: senha atual errada) não derruba a sessão', async () => {
    entrarComo('GERENTE');
    apiFalsa().quando('GET /occurrences', {
      status: 401,
      corpo: { erro: 'Senha atual incorreta.', codigo: 'CREDENCIAIS_INVALIDAS' },
    });
    const { ouvinte, parar } = ouvirSessaoEncerrada();

    await expect(listarOcorrencias(tokenDaSessao()!)).rejects.toMatchObject({ status: 401 });

    expect(sessaoAtual()).not.toBeNull();
    expect(ouvinte).not.toHaveBeenCalled();
    parar();
  });

  it('senha errada no login (sem token) não dispara o "sessão terminou"', async () => {
    apiFalsa().quando('POST /auth/login', {
      status: 401,
      corpo: { erro: 'Credenciais inválidas.', codigo: 'NAO_AUTENTICADO' },
    });
    const { ouvinte, parar } = ouvirSessaoEncerrada();

    await expect(login('a@b.com', 'errada')).rejects.toMatchObject({ status: 401 });

    expect(ouvinte).not.toHaveBeenCalled();
    expect(lerAvisoDoLogin()).toBeNull();
    parar();
  });
});
