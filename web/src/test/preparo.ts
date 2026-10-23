// Roda antes de cada arquivo de teste.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// O jsdom não implementa o scrollTo (só avisa no console). O formulário do cliente o
// usa a cada etapa.
window.scrollTo = () => {};

// Nenhum teste fala com a rede. Sem a API falsa (apiFalsa.ts), o pedido iria à API que
// estivesse rodando na máquina e o teste passaria por acaso. O erro não pode ser só
// lançado: o serviço da API o transformaria em "sem conexão", e a tela seguiria em
// silêncio. Por isso o teste falha no fim, dizendo qual pedido escapou.
let pedidoSemApiFalsa: string | null = null;

beforeEach(() => {
  pedidoSemApiFalsa = null;
  vi.stubGlobal(
    'fetch',
    vi.fn((entrada: RequestInfo | URL) => {
      pedidoSemApiFalsa ??= String(entrada);
      return Promise.reject(new TypeError('Pedido sem API falsa'));
    })
  );
});

// Cada teste começa sem sessão, sem rascunho e sem tela montada: um que entrou como
// gerente não pode deixar o próximo logado.
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  for (const par of document.cookie.split('; ')) {
    const nome = par.split('=')[0];
    if (nome) document.cookie = `${nome}=; Max-Age=0; Path=/`;
  }
  window.history.replaceState(null, '', '/');

  if (pedidoSemApiFalsa) {
    throw new Error(`Pedido sem API falsa: ${pedidoSemApiFalsa}. Chame apiFalsa() antes de abrir a tela.`);
  }
});
