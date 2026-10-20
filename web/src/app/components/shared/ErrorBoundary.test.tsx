import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Quebra({ mensagem }: { mensagem: string }): never {
  throw new Error(mensagem);
}

function abrir(mensagem: string, { dentroDoMenu = false, endereco = '/gerente/dashboard' } = {}) {
  window.history.replaceState(null, '', endereco);
  return render(
    <ErrorBoundary dentroDoMenu={dentroDoMenu}>
      <Quebra mensagem={mensagem} />
    </ErrorBoundary>
  );
}

// O React (em desenvolvimento) e o boundary registram o erro de propósito; aqui ele é
// esperado e só sujaria a saída dos testes.
const calarErroEsperado = (evento: ErrorEvent) => evento.preventDefault();

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  window.addEventListener('error', calarErroEsperado);
});

afterEach(() => {
  window.removeEventListener('error', calarErroEsperado);
  delete (navigator as { onLine?: boolean }).onLine;
});

describe('tela de erro', () => {
  it('erro do código na gestão: tentar de novo ou voltar ao painel, com o detalhe técnico', () => {
    abrir("Cannot read properties of undefined (reading 'total')");
    expect(screen.getByRole('heading', { name: 'Algo deu errado nesta tela' })).toBeInTheDocument();
    expect(screen.getByText('Você pode tentar de novo ou voltar ao seu painel.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Meu painel' })).toHaveAttribute('href', '/');
    expect(screen.getByText("Cannot read properties of undefined (reading 'total')")).toBeInTheDocument();
  });

  it.each([
    'Failed to fetch dynamically imported module: https://echo/assets/Reports-abc.js',
    'Importing a module script failed.',
    'error loading dynamically imported module',
  ])('tela que não chegou (%s): pede para conferir a internet', (mensagem) => {
    abrir(mensagem);
    expect(screen.getByRole('heading', { name: 'Não foi possível abrir esta tela' })).toBeInTheDocument();
    expect(screen.getByText('Confira a conexão com a internet e toque em Recarregar.')).toBeInTheDocument();
  });

  it('sem internet, qualquer erro é tratado como falta de conexão', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    abrir('qualquer coisa');
    expect(screen.getByRole('heading', { name: 'Não foi possível abrir esta tela' })).toBeInTheDocument();
  });

  it('no formulário do cliente: só "Recarregar" (a raiz é o login da equipe)', () => {
    abrir('quebrou', { endereco: '/feedback?t=MESA12' });
    expect(screen.queryByRole('link', { name: 'Meu painel' })).not.toBeInTheDocument();
    expect(screen.getByText('Toque em Recarregar para tentar de novo.')).toBeInTheDocument();
  });

  it('fora do menu é a página inteira; dentro, só o conteúdo (o menu já tem o <main>)', () => {
    const fora = abrir('quebrou');
    expect(screen.getByRole('main')).toBeInTheDocument();
    fora.unmount();

    abrir('quebrou', { dentroDoMenu: true });
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Algo deu errado nesta tela' })).toBeInTheDocument();
  });

  it('sem erro, mostra a tela normalmente', () => {
    render(
      <ErrorBoundary>
        <p>tudo certo</p>
      </ErrorBoundary>
    );
    expect(screen.getByText('tudo certo')).toBeInTheDocument();
  });
});
