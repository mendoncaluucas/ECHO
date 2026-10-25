import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType, type InitialEntry } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Privacidade } from './Privacidade';
import { FeedbackForm } from './FeedbackForm';
import { Entrar } from '../Entrar';
import { apiFalsa } from '../../../test/apiFalsa';

// Transparência (LGPD): o que o Echo guarda do cliente e por quanto tempo, com o prazo
// que vale (vindo da API), no formulário e na página de privacidade.

const MESA = {
  venue: { id: 'v1', nome: 'Restaurante Sinuelo' },
  area: { id: 'a1', nome: 'Mesa 12' },
  categorias: [{ id: 'c-alimento', nome: 'Alimento' }],
};

function Endereco() {
  const local = useLocation();
  const tipo = useNavigationType();
  return <output data-testid="endereco" data-navegacao={tipo}>{local.pathname + local.search}</output>;
}

function abrir(entradas: InitialEntry[], indice = entradas.length - 1) {
  const usuario = userEvent.setup();
  render(
    <MemoryRouter initialEntries={entradas} initialIndex={indice}>
      <Routes>
        <Route path="/" element={<Entrar />} />
        <Route path="/feedback" element={<FeedbackForm />} />
        <Route path="/privacidade" element={<Privacidade />} />
      </Routes>
      <Endereco />
    </MemoryRouter>
  );
  return usuario;
}

const endereco = () => screen.getByTestId('endereco');

describe('página de privacidade', () => {
  it('diz os prazos que valem, vindos da API', async () => {
    apiFalsa().quando('GET /public/privacidade', { corpo: { contatoDias: 60, comentarioDias: 730 } });
    abrir(['/privacidade']);

    expect(await screen.findByText('60 dias')).toBeInTheDocument();
    expect(screen.getByText('2 anos')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Como cuidamos dos seus dados' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Para apagar seus dados antes' })).toBeInTheDocument();
  });

  it('abre no topo, mesmo vindo do rodapé de uma página rolada', async () => {
    const rolar = vi.spyOn(window, 'scrollTo');
    apiFalsa().quando('GET /public/privacidade', { corpo: { contatoDias: 90, comentarioDias: 365 } });
    abrir(['/privacidade']);
    await screen.findByText('90 dias');
    expect(rolar).toHaveBeenCalledWith({ top: 0 });
  });

  it('sem a API, diz que o prazo é limitado em vez de inventar um número', async () => {
    apiFalsa().quando('GET /public/privacidade', 'sem-rede');
    abrir(['/privacidade']);
    expect(
      await screen.findByText('Nome, e-mail e comentário ficam por um prazo limitado, definido pelo restaurante.')
    ).toBeInTheDocument();
  });

  it('aberta direto: sem botão de voltar (não há para onde)', async () => {
    apiFalsa().quando('GET /public/privacidade', { corpo: { contatoDias: 90, comentarioDias: 365 } });
    abrir(['/privacidade']);
    await screen.findByText('90 dias');
    expect(screen.queryByRole('button', { name: /Voltar/ })).not.toBeInTheDocument();
  });

  it('vinda da avaliação: "Voltar para a avaliação" volta no histórico, sem empilhar outra cópia', async () => {
    apiFalsa().quando('GET /public/privacidade', { corpo: { contatoDias: 90, comentarioDias: 365 } }).quando('GET /public/venue/MESA12', { corpo: MESA });
    const origem = '/feedback?t=MESA12&etapa=2';
    const usuario = abrir([origem, { pathname: '/privacidade', state: { de: origem } }]);

    await usuario.click(await screen.findByRole('button', { name: 'Voltar para a avaliação' }));

    expect(endereco()).toHaveTextContent(origem);
    // POP: andou para trás no histórico. Um PUSH faria a seta de voltar do formulário
    // cair de novo na página de privacidade.
    expect(endereco()).toHaveAttribute('data-navegacao', 'POP');
  });

  it('com a origem mas sem histórico (primeira página da aba): vai direto para a origem', async () => {
    apiFalsa().quando('GET /public/privacidade', { corpo: { contatoDias: 90, comentarioDias: 365 } }).quando('GET /public/venue/MESA12', { corpo: MESA });
    const origem = '/feedback?t=MESA12';
    const usuario = abrir([{ pathname: '/privacidade', state: { de: origem } }]);

    await usuario.click(await screen.findByRole('button', { name: 'Voltar para a avaliação' }));
    expect(endereco()).toHaveTextContent(origem);
  });
});

describe('no formulário do cliente', () => {
  async function irAteOEmail(usuario: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole('heading', { level: 1, name: 'Como foi a sua experiência?' });
    await usuario.click(screen.getAllByRole('radio')[3]);
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }));
    await usuario.click(await screen.findByRole('button', { name: 'Continuar' }));
    await usuario.click(await screen.findByRole('radio', { name: /Quero que me respondam/ }));
  }

  it('o texto do e-mail diz por quanto tempo o contato fica, com o prazo configurado', async () => {
    apiFalsa().quando('GET /public/venue/MESA12', { corpo: { ...MESA, privacidade: { contatoDias: 60, comentarioDias: 365 } } });
    const usuario = abrir(['/feedback?t=MESA12']);
    await irAteOEmail(usuario);

    expect(
      screen.getByText(
        'Seu nome e e-mail só aparecem para a equipe que for responder, e só para isso. Ficam guardados por 60 dias e depois são apagados.'
      )
    ).toBeInTheDocument();
  });

  it('API de antes da retenção (sem os prazos): o texto não promete prazo nenhum', async () => {
    apiFalsa().quando('GET /public/venue/MESA12', { corpo: MESA });
    const usuario = abrir(['/feedback?t=MESA12']);
    await irAteOEmail(usuario);

    expect(screen.getByText('Seu nome e e-mail só aparecem para a equipe que for responder, e só para isso.')).toBeInTheDocument();
  });

  it('o link aparece desde a primeira etapa, antes de qualquer nota', async () => {
    apiFalsa().quando('GET /public/venue/MESA12', { corpo: MESA });
    abrir(['/feedback?t=MESA12']);
    await screen.findByRole('heading', { level: 1, name: 'Como foi a sua experiência?' });
    expect(screen.getByText('Avalie ao menos uma categoria para continuar.', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Como cuidamos dos seus dados' })).toBeInTheDocument();
  });

  it('o link do rodapé leva à página, que sabe voltar para a mesma etapa', async () => {
    apiFalsa()
      .quando('GET /public/venue/MESA12', { corpo: MESA })
      .quando('GET /public/privacidade', { corpo: { contatoDias: 90, comentarioDias: 365 } });
    const usuario = abrir(['/feedback?t=MESA12']);
    await irAteOEmail(usuario);

    await usuario.click(screen.getByRole('link', { name: 'Como cuidamos dos seus dados' }));
    expect(endereco()).toHaveTextContent('/privacidade');
    await usuario.click(await screen.findByRole('button', { name: 'Voltar para a avaliação' }));

    expect(endereco()).toHaveTextContent('/feedback?t=MESA12&etapa=3');
    expect(await screen.findByRole('heading', { level: 1, name: 'Quer uma resposta da equipe?' })).toBeInTheDocument();
  });
});

describe('no login', () => {
  it('tem o link para a página, que volta para o login', async () => {
    // O login pré-carrega as telas da gestão em segundo plano; aqui só atrapalharia.
    vi.stubGlobal('requestIdleCallback', vi.fn());
    apiFalsa().quando('GET /public/privacidade', { corpo: { contatoDias: 90, comentarioDias: 365 } });
    const usuario = abrir(['/']);

    await usuario.click(await screen.findByRole('link', { name: 'Como cuidamos dos dados dos clientes' }));
    await usuario.click(await screen.findByRole('button', { name: 'Voltar' }));
    expect(endereco()).toHaveTextContent(/^\/$/);
  });
});
