import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SecaoRespostasProntas } from './RespostasProntas';
import { EVENTO_AVISO_RAPIDO } from '../../avisoRapido';
import { descrever } from '../../descricaoDaAuditoria';
import { apiFalsa } from '../../../test/apiFalsa';
import type { RegistroDeAuditoria, RespostaPronta } from '../../services/api';

// Respostas prontas nas configurações: só o administrador cadastra, edita e desativa.

const MODELOS: RespostaPronta[] = [
  { id: 'm1', titulo: 'Pedido de desculpas', texto: 'Sentimos muito.', ativo: true, atualizadoEm: '2026-10-25T20:00:00.000Z' },
  { id: 'm2', titulo: 'Antiga', texto: 'Texto antigo.', ativo: false, atualizadoEm: '2026-10-25T20:00:00.000Z' },
];

function abrir(modelos = MODELOS) {
  const api = apiFalsa()
    .quando('GET /respostas-prontas', { corpo: { itens: modelos } })
    .quando('POST /respostas-prontas', (p) => ({ status: 201, corpo: { id: 'novo', ativo: true, ...(p.corpo as object) } }))
    .quando('PATCH /respostas-prontas/*', (p) => ({ corpo: { ...MODELOS[0], ...(p.corpo as object) } }));
  const usuario = userEvent.setup();
  render(<SecaoRespostasProntas token="tok" />);
  return { api, usuario };
}

function ouvirAvisos() {
  const avisos: string[] = [];
  window.addEventListener(EVENTO_AVISO_RAPIDO, (e) => avisos.push((e as CustomEvent<string>).detail));
  return avisos;
}

describe('respostas prontas nas configurações', () => {
  it('lista os modelos, com o selo de desativada', async () => {
    abrir();
    expect(await screen.findByText('Pedido de desculpas')).toBeInTheDocument();
    expect(screen.getByText('Sentimos muito.')).toBeInTheDocument();
    const antiga = screen.getByText('Antiga').closest('li')!;
    expect(within(antiga).getByText('Desativada')).toBeInTheDocument();
    expect(within(antiga).getByRole('button', { name: 'Reativar Antiga' })).toBeInTheDocument();
  });

  it('nenhum modelo: diz isso e sugere por onde começar', async () => {
    abrir([]);
    expect(await screen.findByText(/Nenhuma resposta pronta ainda/)).toBeInTheDocument();
  });

  it('criar: manda título e texto sem espaços sobrando, avisa e recarrega a lista', async () => {
    const { api, usuario } = abrir();
    const avisos = ouvirAvisos();

    await usuario.click(await screen.findByRole('button', { name: 'Nova resposta pronta' }));
    expect(screen.getByRole('button', { name: 'Criar' })).toBeDisabled();
    await usuario.type(screen.getByLabelText('Título'), '  Agradecimento ');
    await usuario.type(screen.getByLabelText('Texto'), 'Muito obrigado!');
    await usuario.click(screen.getByRole('button', { name: 'Criar' }));

    const [pedido] = api.pedidosPara('POST', '/respostas-prontas');
    expect(pedido.corpo).toEqual({ titulo: 'Agradecimento', texto: 'Muito obrigado!' });
    expect(pedido.autorizacao).toBe('Bearer tok');
    expect(avisos).toContain('Resposta pronta "Agradecimento" criada');
    expect(api.pedidosPara('GET', '/respostas-prontas')).toHaveLength(2);
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
  });

  it('editar: o formulário vem preenchido e manda o que ficou', async () => {
    const { api, usuario } = abrir();

    await usuario.click(await screen.findByRole('button', { name: 'Editar Pedido de desculpas' }));
    const texto = screen.getByLabelText('Texto');
    expect(texto).toHaveValue('Sentimos muito.');
    await usuario.clear(texto);
    await usuario.type(texto, 'Pedimos desculpas.');
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));

    const [pedido] = api.pedidosPara('PATCH', '/respostas-prontas/m1');
    expect(pedido.corpo).toEqual({ titulo: 'Pedido de desculpas', texto: 'Pedimos desculpas.' });
  });

  it('Esc cancela a edição sem mandar nada', async () => {
    const { api, usuario } = abrir();
    await usuario.click(await screen.findByRole('button', { name: 'Editar Pedido de desculpas' }));
    await usuario.type(screen.getByLabelText('Título'), ' mudado{Escape}');
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
    expect(api.pedidosPara('PATCH', '/respostas-prontas/m1')).toHaveLength(0);
  });

  it('desativar e reativar mandam só o ativo', async () => {
    const { api, usuario } = abrir();
    await usuario.click(await screen.findByRole('button', { name: 'Desativar Pedido de desculpas' }));
    await usuario.click(screen.getByRole('button', { name: 'Reativar Antiga' }));
    expect(api.pedidosPara('PATCH', '/respostas-prontas/m1')[0].corpo).toEqual({ ativo: false });
    expect(api.pedidosPara('PATCH', '/respostas-prontas/m2')[0].corpo).toEqual({ ativo: true });
  });

  it('título repetido (409): diz o motivo e mantém o formulário', async () => {
    const { api, usuario } = abrir();
    api.quando('POST /respostas-prontas', { status: 409, corpo: { erro: 'conflito', codigo: 'CONFLITO' } });

    await usuario.click(await screen.findByRole('button', { name: 'Nova resposta pronta' }));
    await usuario.type(screen.getByLabelText('Título'), 'Pedido de desculpas');
    await usuario.type(screen.getByLabelText('Texto'), 'x');
    await usuario.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe uma resposta pronta com esse título.');
    expect(screen.getByLabelText('Título')).toHaveValue('Pedido de desculpas');
  });
});

describe('no log de auditoria', () => {
  const registro = (acao: string, detalhes: object) =>
    ({ id: 'a', acao, entidade: 'RespostaPronta', entidadeId: 'm1', detalhes, criadoEm: '', usuario: null }) as unknown as RegistroDeAuditoria;

  it.each([
    ['RESPOSTA_PRONTA_CRIADA', { titulo: 'Desculpas' }, 'Criou a resposta pronta "Desculpas"'],
    ['RESPOSTA_PRONTA_EDITADA', { titulo: 'Desculpas', textoMudou: true }, 'Mudou o texto da resposta pronta "Desculpas"'],
    [
      'RESPOSTA_PRONTA_EDITADA',
      { titulo: 'Pedido de desculpas', tituloAnterior: 'Desculpas', textoMudou: false },
      'Renomeou a resposta pronta "Desculpas" para "Pedido de desculpas"',
    ],
    [
      'RESPOSTA_PRONTA_EDITADA',
      { titulo: 'Pedido de desculpas', tituloAnterior: 'Desculpas', textoMudou: true },
      'Renomeou a resposta pronta "Desculpas" para "Pedido de desculpas" e mudou o texto',
    ],
    ['RESPOSTA_PRONTA_DESATIVADA', { titulo: 'Desculpas' }, 'Desativou a resposta pronta "Desculpas"'],
    ['RESPOSTA_PRONTA_REATIVADA', { titulo: 'Desculpas' }, 'Reativou a resposta pronta "Desculpas"'],
  ])('%s vira frase', (acao, detalhes, frase) => {
    expect(descrever(registro(acao, detalhes))).toBe(frase);
  });
});
