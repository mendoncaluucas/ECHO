import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { OccurrencesPanel } from './OccurrencesPanel';
import { apiFalsa, entrarComo, type Pedido } from '../../../test/apiFalsa';
import type { Ocorrencia } from '../../services/api';

const RECLAMACAO: Ocorrencia = {
  id: 'oc-1',
  tipo: 'RECLAMACAO',
  comentario: 'O banheiro estava sem papel.',
  anonimo: true,
  criadoEm: new Date().toISOString(),
  status: 'PENDENTE',
  tratadoEm: null,
  tratadoPor: null,
  area: { nome: 'Mesa 12' },
  avaliacoes: [{ categoria: 'Higiene', estrelas: 2 }],
};

// A lista pede 20 por página; as contagens das abas, 1 (só o total interessa).
const ehDaLista = (p: Pedido) => p.busca.get('porPagina') === '20';
const ehContagem = (p: Pedido) => p.busca.get('porPagina') === '1';
const ultimaBuscaDaLista = (pedidos: Pedido[]) => pedidos.filter(ehDaLista).slice(-1)[0];

function apiDaFila() {
  return apiFalsa()
    .quando('GET /categorias', {
      corpo: { itens: [{ id: 'c1', nome: 'Alimento' }, { id: 'c2', nome: 'Higiene' }] },
    })
    .quando('GET /occurrences', (p) => ({
      corpo: ehContagem(p)
        ? { itens: [], total: 7, pagina: 1, porPagina: 1, paginas: 7 }
        : { itens: [RECLAMACAO], total: 1, pagina: 1, porPagina: 20, paginas: 1 },
    }));
}

// Mostra o endereço atual e se a última navegação empilhou histórico.
function Endereco() {
  const local = useLocation();
  const tipo = useNavigationType();
  return (
    <output data-testid="endereco" data-navegacao={tipo}>
      {local.pathname + local.search}
    </output>
  );
}

function abrir(endereco: string) {
  entrarComo('COORDENADOR');
  const usuario = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[endereco]}>
      <Routes>
        <Route
          path="/coordenador/ocorrencias"
          element={
            <>
              <OccurrencesPanel />
              <Endereco />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
  return usuario;
}

const endereco = () => screen.getByTestId('endereco');
const aba = (nome: RegExp) => within(screen.getByRole('group', { name: 'Situação' })).getByRole('button', { name: nome });

describe('fila de ocorrências: filtros no endereço', () => {
  it('o filtro do endereço vale: abas, seletores e a busca na API', async () => {
    const api = apiDaFila();
    abrir('/coordenador/ocorrencias?status=todas&tipo=RECLAMACAO&categoria=Higiene');

    await screen.findByText('“O banheiro estava sem papel.”');
    const lista = ultimaBuscaDaLista(api.pedidos);
    // "Todas" não manda status.
    expect(Object.fromEntries(lista.busca)).toEqual({
      pagina: '1',
      porPagina: '20',
      tipo: 'RECLAMACAO',
      categoria: 'Higiene',
    });
    expect(aba(/^Todas/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('combobox', { name: 'Tipo' })).toHaveValue('RECLAMACAO');
    expect(await screen.findByRole('combobox', { name: 'Categoria avaliada' })).toHaveValue('Higiene');
  });

  it('as contagens das abas usam o mesmo tipo e categoria da lista', async () => {
    const api = apiDaFila();
    abrir('/coordenador/ocorrencias?tipo=ELOGIO&categoria=Alimento');
    await screen.findByText('“O banheiro estava sem papel.”');

    await waitFor(() => expect(api.pedidos.filter(ehContagem)).toHaveLength(4));
    for (const contagem of api.pedidos.filter(ehContagem)) {
      expect(contagem.busca.get('tipo')).toBe('ELOGIO');
      expect(contagem.busca.get('categoria')).toBe('Alimento');
    }
    // Uma por aba: pendentes, em andamento, resolvidas e todas (sem status).
    expect(api.pedidos.filter(ehContagem).map((p) => p.busca.get('status'))).toEqual([
      'PENDENTE',
      'EM_ANDAMENTO',
      'RESOLVIDO',
      null,
    ]);
  });

  it('valor estranho no endereço cai no padrão em vez de quebrar', async () => {
    const api = apiDaFila();
    abrir('/coordenador/ocorrencias?status=QUALQUER&tipo=XYZ');
    await screen.findByText('“O banheiro estava sem papel.”');

    const lista = ultimaBuscaDaLista(api.pedidos);
    expect(lista.busca.get('status')).toBe('PENDENTE');
    expect(lista.busca.has('tipo')).toBe(false);
    expect(aba(/^Pendentes/)).toHaveAttribute('aria-pressed', 'true');
  });

  it('categoria de link antigo que não existe mais continua visível no filtro', async () => {
    apiDaFila();
    abrir('/coordenador/ocorrencias?categoria=Bebidas');
    const seletor = await screen.findByRole('combobox', { name: 'Categoria avaliada' });
    // Sem a opção extra, o campo mostraria "Todas" com o filtro valendo.
    expect(seletor).toHaveValue('Bebidas');
  });

  it('trocar de aba muda o endereço sem empilhar histórico; a aba padrão sai do endereço', async () => {
    const api = apiDaFila();
    const usuario = abrir('/coordenador/ocorrencias?tipo=RECLAMACAO');
    await screen.findByText('“O banheiro estava sem papel.”');

    await usuario.click(aba(/^Resolvidas/));
    expect(endereco()).toHaveTextContent('/coordenador/ocorrencias?tipo=RECLAMACAO&status=RESOLVIDO');
    // Replace: o "voltar" do celular sai da fila, não desfaz clique por clique.
    expect(endereco()).toHaveAttribute('data-navegacao', 'REPLACE');
    await waitFor(() => expect(ultimaBuscaDaLista(api.pedidos).busca.get('status')).toBe('RESOLVIDO'));

    await usuario.click(aba(/^Pendentes/));
    expect(endereco()).toHaveTextContent(/^\/coordenador\/ocorrencias\?tipo=RECLAMACAO$/);
  });

  it('"Limpar filtros" tira tipo e categoria e mantém a aba', async () => {
    apiDaFila();
    const usuario = abrir('/coordenador/ocorrencias?status=todas&tipo=RECLAMACAO&categoria=Higiene');
    await usuario.click(await screen.findByRole('button', { name: 'Limpar filtros' }));
    expect(endereco()).toHaveTextContent(/^\/coordenador\/ocorrencias\?status=todas$/);
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument();
  });

  it('escolher um tipo vai para o endereço e para a API', async () => {
    const api = apiDaFila();
    const usuario = abrir('/coordenador/ocorrencias');
    await screen.findByText('“O banheiro estava sem papel.”');

    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'SUGESTAO');
    expect(endereco()).toHaveTextContent('/coordenador/ocorrencias?tipo=SUGESTAO');
    await waitFor(() => expect(ultimaBuscaDaLista(api.pedidos).busca.get('tipo')).toBe('SUGESTAO'));
  });

  it('cada ocorrência é um link para o detalhe', async () => {
    apiDaFila();
    abrir('/coordenador/ocorrencias');
    const link = (await screen.findByText('“O banheiro estava sem papel.”')).closest('a');
    expect(link).toHaveAttribute('href', '/coordenador/ocorrencia/oc-1');
  });
});
