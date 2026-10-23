import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ItemDaOcorrencia } from './ItemDaOcorrencia';
import { OccurrenceDetail } from './OccurrenceDetail';
import { csvDasOcorrencias } from '../manager/IssueRegistry';
import { apiFalsa, entrarComo } from '../../../test/apiFalsa';
import type { Ocorrencia } from '../../services/api';

// Retenção (LGPD): o que saiu pelo prazo diz que saiu. "Sem comentário" ou "o cliente
// não deixou contato" seriam falsos, e "Pediu resposta" mandaria a equipe procurar um
// e-mail que não existe mais.

const APAGADO_EM = '2026-10-21T18:00:00.000Z';
const dataApagada = new Date(APAGADO_EM).toLocaleDateString('pt-BR');

const BASE: Ocorrencia = {
  id: 'oc-1',
  tipo: 'RECLAMACAO',
  comentario: null,
  anonimo: false,
  criadoEm: '2025-06-01T15:00:00.000Z',
  status: 'RESOLVIDO',
  tratadoEm: null,
  tratadoPor: null,
  area: { nome: 'Mesa 12' },
  avaliacoes: [{ categoria: 'Higiene', estrelas: 2 }],
  contatoApagadoEm: null,
  comentarioApagadoEm: null,
  contato: null,
};

function item(o: Partial<Ocorrencia>) {
  render(
    <MemoryRouter>
      <ItemDaOcorrencia ocorrencia={{ ...BASE, ...o }} />
    </MemoryRouter>
  );
}

async function detalhe(o: Partial<Ocorrencia>) {
  apiFalsa().quando('GET /occurrences/oc-1', { corpo: { ...BASE, ...o } });
  entrarComo('COORDENADOR');
  render(
    <MemoryRouter initialEntries={['/coordenador/ocorrencia/oc-1']}>
      <Routes>
        <Route path="/coordenador/ocorrencia/:id" element={<OccurrenceDetail />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByText('O que o cliente escreveu');
}

describe('na lista', () => {
  it('pediu resposta e o contato ainda existe: selo "Pediu resposta"', () => {
    item({});
    expect(screen.getByText('Pediu resposta')).toBeInTheDocument();
  });

  it('contato já apagado: sem o selo (não há a quem responder)', () => {
    item({ contatoApagadoEm: APAGADO_EM });
    expect(screen.queryByText('Pediu resposta')).not.toBeInTheDocument();
  });

  it('comentário apagado diz que foi, e quando; sem comentário continua "Sem comentário"', () => {
    item({ comentarioApagadoEm: APAGADO_EM });
    expect(screen.getByText(`Comentário apagado em ${dataApagada}, pela política de privacidade`)).toBeInTheDocument();
  });

  it('nunca teve comentário: "Sem comentário"', () => {
    item({});
    expect(screen.getByText('Sem comentário')).toBeInTheDocument();
  });

  it('a API de antes da retenção (sem os campos novos) continua funcionando', () => {
    const { contatoApagadoEm: _a, comentarioApagadoEm: _b, ...semCampos } = BASE;
    render(
      <MemoryRouter>
        <ItemDaOcorrencia ocorrencia={semCampos as Ocorrencia} />
      </MemoryRouter>
    );
    expect(screen.getByText('Pediu resposta')).toBeInTheDocument();
    expect(screen.getByText('Sem comentário')).toBeInTheDocument();
  });
});

describe('na exportação CSV do registro', () => {
  it('comentário apagado diz que foi; sem comentário fica vazio', () => {
    const csv = csvDasOcorrencias([
      { ...BASE, id: 'apagado', comentarioApagadoEm: APAGADO_EM },
      { ...BASE, id: 'vazio' },
      { ...BASE, id: 'escrito', comentario: 'Mesa suja' },
    ]);
    const linha = (id: string) => csv.split(/\r?\n/).find((l) => l.includes(id))!;
    expect(linha('apagado')).toContain(`(Comentário apagado em ${dataApagada}, pela política de privacidade)`);
    expect(linha('vazio')).not.toContain('apagado');
    expect(linha('escrito')).toContain('Mesa suja');
  });
});

describe('no detalhe', () => {
  it('contato apagado: diz que o cliente pediu resposta e quando o contato saiu', async () => {
    await detalhe({ contatoApagadoEm: APAGADO_EM });
    expect(
      screen.getByText(`O cliente pediu resposta, mas o contato foi apagado em ${dataApagada}, pela política de privacidade.`)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Avaliação anônima/)).not.toBeInTheDocument();
  });

  it('anônima de verdade continua dizendo que é anônima', async () => {
    await detalhe({ anonimo: true });
    expect(screen.getByText('Avaliação anônima: o cliente não deixou contato para resposta.')).toBeInTheDocument();
  });

  it('comentário apagado diz que foi, e quando', async () => {
    await detalhe({ comentarioApagadoEm: APAGADO_EM });
    expect(screen.getByText(`Comentário apagado em ${dataApagada}, pela política de privacidade.`)).toBeInTheDocument();
    expect(screen.queryByText(/não escreveu comentário/)).not.toBeInTheDocument();
  });

  it('sem comentário de verdade continua dizendo que não escreveu', async () => {
    await detalhe({});
    expect(screen.getByText('O cliente não escreveu comentário, só deu as notas.')).toBeInTheDocument();
  });
});
