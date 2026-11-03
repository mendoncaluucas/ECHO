import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QRGenerator } from './QRGenerator';
import { apiFalsa, entrarComo } from '../../../test/apiFalsa';

// "Baixar PNG": a API limita os downloads por minuto (429). A tela diz para esperar, e
// não o erro genérico de "atualize a página", que gastaria mais pedidos.

const AREA = { id: 'a1', nome: 'Mesa 12', ativo: true, venue: { nome: 'Restaurante Sinuelo' } };
const QR = {
  id: 'q1',
  token: 'abc123',
  ativo: true,
  criadoEm: '2026-11-03T12:00:00.000Z',
  area: { id: 'a1', nome: 'Mesa 12' },
  url: 'http://localhost:5173/feedback?t=abc123',
};

function abrir() {
  const api = apiFalsa()
    .quando('GET /areas', { corpo: { itens: [AREA] } })
    .quando('GET /qrcodes', { corpo: { itens: [QR] } });
  entrarComo('ADMINISTRADOR');
  const usuario = userEvent.setup();
  render(
    <MemoryRouter>
      <QRGenerator />
    </MemoryRouter>
  );
  return { api, usuario };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('baixar o PNG do QR Code', () => {
  it('limite da API (429): pede para esperar um minuto, sem baixar nada', async () => {
    const { api, usuario } = abrir();
    api.quando('GET /qrcodes/abc123/imagem', {
      status: 429,
      corpo: { erro: 'Muitos downloads seguidos.', codigo: 'MUITAS_REQUISICOES', tenteEmSegundos: 40 },
    });
    const criarLink = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: criarLink, revokeObjectURL: vi.fn() }));

    await usuario.click(await screen.findByRole('button', { name: /Baixar PNG/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Muitos downloads seguidos. Espere um minuto e tente de novo.');
    expect(criarLink).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Baixar PNG/ })).toBeEnabled();
  });

  it('pede o PNG de 1024 px (o máximo da API) e entrega o arquivo', async () => {
    const { api, usuario } = abrir();
    api.quando('GET /qrcodes/abc123/imagem', { corpo: 'png' });
    const criarLink = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: criarLink, revokeObjectURL: vi.fn() }));
    const clicar = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await usuario.click(await screen.findByRole('button', { name: /Baixar PNG/ }));

    await vi.waitFor(() => expect(clicar).toHaveBeenCalled());
    const [pedido] = api.pedidosPara('GET', '/qrcodes/abc123/imagem');
    expect(pedido.busca.get('formato')).toBe('png');
    expect(pedido.busca.get('tamanho')).toBe('1024');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('outro erro (QR desativado em outra aba): o aviso de sempre', async () => {
    const { api, usuario } = abrir();
    api.quando('GET /qrcodes/abc123/imagem', { status: 404, corpo: { codigo: 'QR_NAO_ENCONTRADO' } });

    await usuario.click(await screen.findByRole('button', { name: /Baixar PNG/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível baixar a imagem. Atualize a página e tente de novo.'
    );
  });
});
