import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { FeedbackForm } from './FeedbackForm';
import { Success } from './Success';
import { apiFalsa } from '../../../test/apiFalsa';

const MESA = {
  venue: { id: 'v1', nome: 'Restaurante Sinuelo' },
  area: { id: 'a1', nome: 'Mesa 12' },
  categorias: [
    { id: 'c-alimento', nome: 'Alimento' },
    { id: 'c-atendimento', nome: 'Atendimento' },
    { id: 'c-higiene', nome: 'Higiene' },
  ],
};

function apiDaMesa() {
  return apiFalsa()
    .quando('GET /public/venue/MESA12', { corpo: MESA })
    .quando('POST /public/feedback', { status: 201, corpo: { id: 'f1', criadoEm: '2026-10-15T12:00:00Z' } });
}

function abrir(endereco = '/feedback?t=MESA12') {
  const usuario = userEvent.setup();
  const tela = render(
    <MemoryRouter initialEntries={[endereco]}>
      <Routes>
        <Route path="/feedback" element={<FeedbackForm />} />
        <Route path="/sucesso" element={<Success />} />
      </Routes>
    </MemoryRouter>
  );
  return { usuario, ...tela };
}

const titulo = (nome: string) => screen.findByRole('heading', { level: 1, name: nome });

async function darNota(usuario: ReturnType<typeof userEvent.setup>, categoria: string, estrelas: number) {
  const grupo = screen.getByRole('radiogroup', { name: `Nota para ${categoria}` });
  const opcao = within(grupo).getAllByRole('radio')[estrelas - 1];
  await usuario.click(opcao);
}

const botao = (nome: string | RegExp) => screen.getByRole('button', { name: nome });

describe('avaliação do cliente', () => {
  it('anônima, nas três etapas: envia só o que o cliente marcou', async () => {
    const api = apiDaMesa();
    const { usuario } = abrir();

    await titulo('Como foi a sua experiência?');
    expect(screen.getByText('Mesa 12')).toBeInTheDocument();
    // Sem nenhuma nota não dá para seguir.
    expect(botao('Continuar')).toBeDisabled();

    await darNota(usuario, 'Alimento', 4);
    await darNota(usuario, 'Atendimento', 5);
    expect(screen.getByText('Bom')).toBeInTheDocument();
    await usuario.click(botao('Continuar'));

    await titulo('Quer contar mais?');
    // Média 4,5: chega com "Elogio" marcado.
    expect(screen.getByRole('radio', { name: 'Elogio' })).toBeChecked();
    await usuario.type(screen.getByRole('textbox'), '  Tudo ótimo  ');
    await usuario.click(botao('Continuar'));

    await titulo('Quer uma resposta da equipe?');
    expect(screen.getByRole('radio', { name: /Prefiro ficar anônimo/ })).toBeChecked();
    await usuario.click(botao('Enviar avaliação'));

    await titulo('Obrigado pela sua avaliação!');
    expect(api.pedidosPara('POST', '/public/feedback')[0].corpo).toEqual({
      qrToken: 'MESA12',
      tipo: 'ELOGIO',
      comentario: 'Tudo ótimo',
      anonimo: true,
      contatoNome: null,
      contatoEmail: null,
      avaliacoes: [
        { categoriaId: 'c-alimento', estrelas: 4 },
        { categoriaId: 'c-atendimento', estrelas: 5 },
      ],
    });
    // O rascunho sai depois do envio: a próxima pessoa da mesa começa do zero.
    expect(sessionStorage.getItem('echo_avaliacao_MESA12')).toBeNull();
    // E pode avaliar também.
    expect(botao('Outra pessoa da mesa quer avaliar')).toBeInTheDocument();
  });

  it('nota baixa sugere reclamação, e a escolha do cliente não é sobrescrita ao voltar', async () => {
    apiDaMesa();
    const { usuario } = abrir();
    await titulo('Como foi a sua experiência?');

    await darNota(usuario, 'Higiene', 1);
    await usuario.click(botao('Continuar'));
    await titulo('Quer contar mais?');
    expect(screen.getByRole('radio', { name: 'Reclamação' })).toBeChecked();
    expect(screen.getByText('O que aconteceu? Conte para a equipe resolver.')).toBeInTheDocument();

    await usuario.click(screen.getByRole('radio', { name: 'Sugestão' }));
    await usuario.click(botao('Voltar para a etapa anterior'));
    await titulo('Como foi a sua experiência?');
    await darNota(usuario, 'Alimento', 5);
    await usuario.click(botao('Continuar'));

    await titulo('Quer contar mais?');
    expect(screen.getByRole('radio', { name: 'Sugestão' })).toBeChecked();
  });

  it('quem pede resposta precisa de um e-mail válido; nome e e-mail vão sem espaços', async () => {
    const api = apiDaMesa();
    const { usuario } = abrir();
    await titulo('Como foi a sua experiência?');
    await darNota(usuario, 'Atendimento', 2);
    await usuario.click(botao('Continuar'));
    await usuario.click(botao('Continuar'));
    await titulo('Quer uma resposta da equipe?');

    await usuario.click(screen.getByRole('radio', { name: /Quero que me respondam/ }));
    const email = screen.getByLabelText('E-mail para a resposta');
    await usuario.type(email, 'cliente@semponto');
    await usuario.click(botao('Enviar avaliação'));

    expect(api.pedidosPara('POST', '/public/feedback')).toHaveLength(0);
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Confira o e-mail: ele precisa ter o formato nome@exemplo.com.')).toBeInTheDocument();

    await usuario.clear(email);
    await usuario.type(email, '  cliente@exemplo.com ');
    await usuario.type(screen.getByLabelText(/Como podemos te chamar/), '  Ana ');
    await usuario.click(botao('Enviar avaliação'));

    await titulo('Obrigado pela sua avaliação!');
    expect(api.pedidosPara('POST', '/public/feedback')[0].corpo).toMatchObject({
      anonimo: false,
      contatoNome: 'Ana',
      contatoEmail: 'cliente@exemplo.com',
    });
    expect(screen.getByText(/pode te responder pelo e-mail que você deixou/)).toBeInTheDocument();
  });

  it('desistir da resposta depois de digitar o e-mail não manda o contato', async () => {
    const api = apiDaMesa();
    const { usuario } = abrir();
    await titulo('Como foi a sua experiência?');
    await darNota(usuario, 'Alimento', 3);
    await usuario.click(botao('Continuar'));
    await usuario.click(botao('Continuar'));
    await usuario.click(await screen.findByRole('radio', { name: /Quero que me respondam/ }));
    await usuario.type(screen.getByLabelText('E-mail para a resposta'), 'ana@exemplo.com');
    await usuario.click(screen.getByRole('radio', { name: /Prefiro ficar anônimo/ }));
    await usuario.click(botao('Enviar avaliação'));

    await titulo('Obrigado pela sua avaliação!');
    expect(api.pedidosPara('POST', '/public/feedback')[0].corpo).toMatchObject({
      anonimo: true,
      contatoNome: null,
      contatoEmail: null,
    });
  });

  it('o rascunho sobrevive a recarregar a página', async () => {
    apiDaMesa();
    const primeira = abrir();
    await titulo('Como foi a sua experiência?');
    await darNota(primeira.usuario, 'Alimento', 4);
    primeira.unmount();

    abrir();
    await titulo('Como foi a sua experiência?');
    const estrelas = within(screen.getByRole('radiogroup', { name: 'Nota para Alimento' })).getAllByRole('radio');
    expect(estrelas[3]).toBeChecked();
    expect(botao('Continuar')).toBeEnabled();
  });

  it('outra mesa não herda o rascunho', async () => {
    apiDaMesa().quando('GET /public/venue/MESA7', { corpo: { ...MESA, area: { id: 'a7', nome: 'Mesa 7' } } });
    sessionStorage.setItem('echo_avaliacao_MESA12', JSON.stringify({ notas: { 'c-alimento': 4 } }));
    abrir('/feedback?t=MESA7');
    await titulo('Como foi a sua experiência?');
    expect(screen.getByText('Mesa 7')).toBeInTheDocument();
    expect(botao('Continuar')).toBeDisabled();
  });

  it('nota de categoria que saiu entre começar e enviar não vai no envio', async () => {
    const api = apiDaMesa();
    sessionStorage.setItem(
      'echo_avaliacao_MESA12',
      JSON.stringify({ notas: { 'c-removida': 2, 'c-alimento': 5 } })
    );
    const { usuario } = abrir();
    await titulo('Como foi a sua experiência?');
    await usuario.click(botao('Continuar'));
    await titulo('Quer contar mais?');
    // A média considera só a categoria que existe: 5, elogio.
    expect(screen.getByRole('radio', { name: 'Elogio' })).toBeChecked();
    await usuario.click(botao('Continuar'));
    await usuario.click(await screen.findByRole('button', { name: 'Enviar avaliação' }));

    await titulo('Obrigado pela sua avaliação!');
    expect(api.pedidosPara('POST', '/public/feedback')[0].corpo).toMatchObject({
      avaliacoes: [{ categoriaId: 'c-alimento', estrelas: 5 }],
    });
  });

  it('etapa 3 aberta pelo endereço sem nenhuma nota volta para a primeira', async () => {
    apiDaMesa();
    abrir('/feedback?t=MESA12&etapa=3');
    await titulo('Como foi a sua experiência?');
  });

  it('QR que não vale mais: aviso, sem formulário', async () => {
    apiFalsa().quando('GET /public/venue/VELHO', { status: 404, corpo: { erro: 'QR Code não encontrado.' } });
    abrir('/feedback?t=VELHO');
    await titulo('QR Code não identificado');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('sem código no endereço: aviso, e nem chama a API', async () => {
    const api = apiFalsa();
    abrir('/feedback');
    await titulo('QR Code não identificado');
    expect(api.pedidos).toHaveLength(0);
  });

  it('sem conexão ao abrir: "Tentar de novo" abre o formulário quando a rede volta', async () => {
    const api = apiFalsa().quando('GET /public/venue/MESA12', 'sem-rede');
    const { usuario } = abrir();
    await titulo('Não conseguimos abrir a avaliação');

    api.quando('GET /public/venue/MESA12', { corpo: MESA });
    await usuario.click(botao('Tentar de novo'));
    await titulo('Como foi a sua experiência?');
  });

  it('servidor acordando: depois de 4 s a tela explica a espera', async () => {
    vi.useFakeTimers();
    try {
      apiFalsa().quando('GET /public/venue/MESA12', () => new Promise(() => {}));
      abrir();
      expect(screen.getByRole('status')).toHaveTextContent('Carregando…');
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.getByRole('status')).toHaveTextContent('Só um instante: estamos preparando a sua avaliação.');
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [500, 'Não foi possível enviar agora. Suas respostas estão guardadas: tente de novo.'],
    [404, 'Este QR Code não está mais ativo. Peça ajuda a um atendente.'],
  ])('falha no envio (%i): mensagem certa e o cliente continua na etapa 3', async (status, mensagem) => {
    apiDaMesa().quando('POST /public/feedback', { status, corpo: { erro: 'falhou' } });
    const { usuario } = abrir();
    await titulo('Como foi a sua experiência?');
    await darNota(usuario, 'Alimento', 4);
    await usuario.click(botao('Continuar'));
    await usuario.click(botao('Continuar'));
    await usuario.click(await screen.findByRole('button', { name: 'Enviar avaliação' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(mensagem);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Quer uma resposta da equipe?');
    // As respostas continuam guardadas para tentar de novo.
    expect(sessionStorage.getItem('echo_avaliacao_MESA12')).toContain('c-alimento');
  });
});
