import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AvisosPorEmail } from './AvisosPorEmail';
import { EVENTO_AVISO_RAPIDO } from '../../avisoRapido';
import { apiFalsa } from '../../../test/apiFalsa';
import { descrever } from '../../descricaoDaAuditoria';
import type { RegistroDeAuditoria } from '../../services/api';

// Escolha de cada pessoa da equipe: quais feedbacks chegam também por e-mail.

const PREFERENCIAS = {
  avisoPorEmail: 'RECLAMACOES',
  email: 'gerente@sinuelo.com',
  envioLigado: true,
  modoDeTeste: false,
};

function abrir() {
  const usuario = userEvent.setup();
  render(<AvisosPorEmail token="tok" />);
  return usuario;
}

function ouvirAvisos() {
  const avisos: string[] = [];
  window.addEventListener(EVENTO_AVISO_RAPIDO, (e) => avisos.push((e as CustomEvent<string>).detail));
  return avisos;
}

const opcao = (nome: string) => screen.getByRole('button', { name: nome });

describe('avisos por e-mail', () => {
  it('mostra a escolha salva, para qual e-mail vai e o que ela quer dizer', async () => {
    apiFalsa().quando('GET /notifications/preferencias', { corpo: PREFERENCIAS });
    abrir();

    expect(await screen.findByText('Além do sino, para gerente@sinuelo.com.')).toBeInTheDocument();
    expect(opcao('Reclamações')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/a cada reclamação nova/)).toBeInTheDocument();
    expect(screen.queryByText(/Em teste/)).not.toBeInTheDocument();
  });

  it('tocar numa opção salva na hora, com o token, e confirma com um aviso rápido', async () => {
    const api = apiFalsa()
      .quando('GET /notifications/preferencias', { corpo: PREFERENCIAS })
      .quando('PATCH /notifications/preferencias', (p) => ({ corpo: { ...PREFERENCIAS, ...(p.corpo as object) } }));
    const avisos = ouvirAvisos();
    const usuario = abrir();

    await usuario.click(await screen.findByRole('button', { name: 'Todos' }));

    expect(opcao('Todos')).toHaveAttribute('aria-pressed', 'true');
    const [pedido] = api.pedidosPara('PATCH', '/notifications/preferencias');
    expect(pedido.corpo).toEqual({ avisoPorEmail: 'TODOS' });
    expect(pedido.autorizacao).toBe('Bearer tok');
    expect(await screen.findByText(/a cada feedback novo/)).toBeInTheDocument();
    expect(avisos).toContain('Avisos por e-mail: todos os feedbacks');
  });

  it('tocar na opção que já está escolhida não manda nada', async () => {
    const api = apiFalsa().quando('GET /notifications/preferencias', { corpo: PREFERENCIAS });
    const usuario = abrir();
    await usuario.click(await screen.findByRole('button', { name: 'Reclamações' }));
    expect(api.pedidosPara('PATCH', '/notifications/preferencias')).toHaveLength(0);
  });

  it('se o servidor recusar, volta para a escolha salva e diz o erro', async () => {
    apiFalsa()
      .quando('GET /notifications/preferencias', { corpo: PREFERENCIAS })
      .quando('PATCH /notifications/preferencias', { status: 500, corpo: { erro: 'Erro interno' } });
    const usuario = abrir();

    await usuario.click(await screen.findByRole('button', { name: 'Nenhum' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno');
    expect(opcao('Reclamações')).toHaveAttribute('aria-pressed', 'true');
    expect(opcao('Nenhum')).toHaveAttribute('aria-pressed', 'false');
  });

  it('cliques seguidos: vale o último, mesmo que a resposta do primeiro chegue depois', async () => {
    let liberarPrimeiro!: () => void;
    const primeiroSegurado = new Promise<void>((r) => (liberarPrimeiro = r));
    apiFalsa()
      .quando('GET /notifications/preferencias', { corpo: PREFERENCIAS })
      .quando('PATCH /notifications/preferencias', async (p) => {
        const valor = (p.corpo as { avisoPorEmail: string }).avisoPorEmail;
        if (valor === 'TODOS') await primeiroSegurado;
        return { corpo: { ...PREFERENCIAS, avisoPorEmail: valor } };
      });
    const usuario = abrir();

    await usuario.click(await screen.findByRole('button', { name: 'Todos' }));
    await usuario.click(opcao('Nenhum'));
    expect(await screen.findByText(/Você não recebe e-mail/)).toBeInTheDocument();
    liberarPrimeiro();
    await new Promise((r) => setTimeout(r, 0));

    expect(opcao('Nenhum')).toHaveAttribute('aria-pressed', 'true');
  });

  it('em modo de teste, avisa que o e-mail vai para um endereço de demonstração', async () => {
    apiFalsa().quando('GET /notifications/preferencias', { corpo: { ...PREFERENCIAS, modoDeTeste: true } });
    abrir();
    expect(
      await screen.findByText('Em teste: os e-mails vão para um endereço de demonstração, não para o seu.')
    ).toBeInTheDocument();
  });

  it('com o envio desligado no servidor, diz isso em vez de oferecer uma escolha que não faz nada', async () => {
    apiFalsa().quando('GET /notifications/preferencias', { corpo: { ...PREFERENCIAS, envioLigado: false } });
    abrir();
    expect(await screen.findByText(/O envio de e-mail não está ligado neste servidor/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Todos' })).not.toBeInTheDocument();
  });

  it('sem a API, mostra o erro com "tentar de novo", que recarrega', async () => {
    let falhar = true;
    apiFalsa().quando('GET /notifications/preferencias', () =>
      falhar ? { status: 500, corpo: { erro: 'Não foi possível carregar.' } } : { corpo: PREFERENCIAS }
    );
    const usuario = abrir();

    await screen.findByText('Não foi possível carregar.');
    falhar = false;
    await usuario.click(screen.getByRole('button', { name: /Tentar de novo/i }));

    expect(await screen.findByText('Além do sino, para gerente@sinuelo.com.')).toBeInTheDocument();
  });
});

describe('no log de auditoria', () => {
  it('a mudança vira frase, com as opções pelo nome', () => {
    const registro = {
      id: 'r1',
      acao: 'AVISO_POR_EMAIL_ALTERADO',
      entidade: 'User',
      entidadeId: 'u-ger',
      detalhes: { de: 'RECLAMACOES', para: 'TODOS' },
      criadoEm: '2026-10-25T17:00:00.000Z',
      usuario: { id: 'u-ger', nome: 'Gerente Sinuelo' },
    } as unknown as RegistroDeAuditoria;
    expect(descrever(registro)).toBe('Mudou os próprios avisos por e-mail: só reclamações → todos os feedbacks');
  });
});
