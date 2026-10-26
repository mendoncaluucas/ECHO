import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { OccurrenceDetail } from './OccurrenceDetail';
import { ItemDaOcorrencia } from './ItemDaOcorrencia';
import { EVENTO_AVISO_RAPIDO } from '../../avisoRapido';
import { contagemDaRetencao, descrever } from '../../descricaoDaAuditoria';
import { apiFalsa, entrarComo } from '../../../test/apiFalsa';
import type { Ocorrencia, RegistroDeAuditoria, RespostaAoCliente, RespostaPronta } from '../../services/api';

// Resposta ao cliente pelo Echo: a equipe escreve no detalhe, o Echo envia por e-mail e
// guarda o que foi dito.

const BASE: Ocorrencia = {
  id: 'oc-1',
  tipo: 'RECLAMACAO',
  comentario: 'Demorou muito.',
  anonimo: false,
  criadoEm: '2026-10-25T15:00:00.000Z',
  status: 'PENDENTE',
  tratadoEm: null,
  tratadoPor: null,
  area: { nome: 'Mesa 12' },
  avaliacoes: [{ categoria: 'Atendimento', estrelas: 2 }],
  contatoApagadoEm: null,
  comentarioApagadoEm: null,
  contato: { nome: 'Mariana', email: 'mariana@cliente.com' },
  respondida: false,
  respostas: [],
  envioDeEmail: 'ligado',
};

const SAUDACAO = `Olá, Mariana!\n\nRecebemos a avaliação que você deixou em ${new Date(BASE.criadoEm).toLocaleDateString('pt-BR')} (Mesa 12).`;

const RESPOSTA: RespostaAoCliente = {
  id: 'r-1',
  texto: 'Olá, Mariana! Pedimos desculpas.',
  textoApagadoEm: null,
  enviadaEm: '2026-10-25T19:10:00.000Z',
  autor: { nome: 'Coordenadora Sinuelo' },
};

// Botão de fora da tela que troca de ocorrência sem desmontar o detalhe, como o sino.
function IrPara({ id }: { id: string }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(`/coordenador/ocorrencia/${id}`)}>ir para {id}</button>;
}

// `modelos`: as respostas prontas que a API devolve ('sem-rede' simula a falha). Sem
// elas a rota não é simulada, e a tela segue sem o seletor.
async function abrir(o: Partial<Ocorrencia> = {}, modelos?: RespostaPronta[] | 'sem-rede') {
  const api = apiFalsa().quando('GET /occurrences/oc-1', { corpo: { ...BASE, ...o } });
  if (modelos === 'sem-rede') api.quando('GET /respostas-prontas', 'sem-rede');
  else if (modelos) api.quando('GET /respostas-prontas', { corpo: { itens: modelos } });
  entrarComo('COORDENADOR');
  const usuario = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/coordenador/ocorrencia/oc-1']}>
      <Routes>
        <Route
          path="/coordenador/ocorrencia/:id"
          element={
            <>
              <OccurrenceDetail />
              <IrPara id="oc-2" />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByText('O que o cliente escreveu');
  return { api, usuario };
}

const caixa = () => screen.getByLabelText('Sua resposta');
const botaoEnviar = () => screen.getByRole('button', { name: 'Enviar resposta' });

function ouvirAvisos() {
  const avisos: string[] = [];
  window.addEventListener(EVENTO_AVISO_RAPIDO, (e) => avisos.push((e as CustomEvent<string>).detail));
  return avisos;
}

describe('responder pelo Echo', () => {
  it('a caixa começa com a saudação, e o botão espera alguém escrever', async () => {
    await abrir();
    expect((caixa() as HTMLTextAreaElement).value.trim()).toBe(SAUDACAO);
    expect(botaoEnviar()).toBeDisabled();
  });

  it('envia o texto da caixa, com o token, mostra o que foi enviado e volta a caixa para a saudação', async () => {
    const { api, usuario } = await abrir();
    api.quando('POST /occurrences/oc-1/respostas', (p) => ({
      status: 201,
      corpo: { ...RESPOSTA, texto: (p.corpo as { texto: string }).texto },
    }));
    const avisos = ouvirAvisos();

    await usuario.type(caixa(), 'Pedimos desculpas pela demora.');
    await usuario.click(botaoEnviar());

    const [pedido] = api.pedidosPara('POST', '/occurrences/oc-1/respostas');
    expect((pedido.corpo as { texto: string }).texto).toBe(`${SAUDACAO}\n\nPedimos desculpas pela demora.`);
    expect(pedido.autorizacao).toMatch(/^Bearer /);

    const enviadas = await screen.findByRole('region', { name: 'Resposta enviada' });
    expect(within(enviadas).getByText(/Pedimos desculpas pela demora\./)).toBeInTheDocument();
    expect(within(enviadas).getByText('Coordenadora Sinuelo')).toBeInTheDocument();
    expect(avisos).toContain('Resposta enviada para mariana@cliente.com');
    expect((caixa() as HTMLTextAreaElement).value.trim()).toBe(SAUDACAO);
  });

  it('enquanto envia, o botão trava: dois cliques não mandam dois e-mails', async () => {
    const { api, usuario } = await abrir();
    let liberar!: () => void;
    const segurado = new Promise<void>((r) => (liberar = r));
    api.quando('POST /occurrences/oc-1/respostas', async () => {
      await segurado;
      return { status: 201, corpo: RESPOSTA };
    });

    await usuario.type(caixa(), 'Oi');
    await usuario.click(botaoEnviar());
    const enviando = screen.getByRole('button', { name: 'Enviando…' });
    expect(enviando).toBeDisabled();
    await usuario.click(enviando);
    liberar();

    await screen.findByRole('region', { name: 'Resposta enviada' });
    expect(api.pedidosPara('POST', '/occurrences/oc-1/respostas')).toHaveLength(1);
  });

  it('se o e-mail não saiu, diz o erro e mantém o texto para tentar de novo', async () => {
    const { api, usuario } = await abrir();
    api.quando('POST /occurrences/oc-1/respostas', {
      status: 502,
      corpo: { erro: 'O e-mail não foi enviado. Tente de novo em instantes.', codigo: 'EMAIL_NAO_ENVIADO' },
    });

    await usuario.type(caixa(), 'Pedimos desculpas.');
    await usuario.click(botaoEnviar());

    expect(await screen.findByRole('alert')).toHaveTextContent('O e-mail não foi enviado. Tente de novo em instantes.');
    expect((caixa() as HTMLTextAreaElement).value).toContain('Pedimos desculpas.');
    expect(screen.queryByRole('region', { name: /Resposta enviada/ })).not.toBeInTheDocument();
  });

  it('em teste, avisa que a resposta vai para o endereço de demonstração', async () => {
    await abrir({ envioDeEmail: 'teste' });
    expect(
      screen.getByText(/Em teste: a resposta vai para o endereço de demonstração, não para o cliente\./)
    ).toBeInTheDocument();
  });

  it('com o envio desligado na API, fica só o "Responder por e-mail" (mailto)', async () => {
    await abrir({ envioDeEmail: 'desligado' });
    expect(screen.queryByLabelText('Sua resposta')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Responder por e-mail' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^mailto:mariana@cliente\.com\?/)
    );
  });

  it('API de antes das respostas (sem envioDeEmail): igual ao desligado', async () => {
    await abrir({ envioDeEmail: undefined, respostas: undefined });
    expect(screen.queryByLabelText('Sua resposta')).not.toBeInTheDocument();
  });

  it('trocar de ocorrência sem sair da tela não leva o rascunho junto', async () => {
    const { api, usuario } = await abrir();
    api.quando('GET /occurrences/oc-2', {
      corpo: { ...BASE, id: 'oc-2', contato: { nome: 'Rui', email: 'rui@cliente.com' } },
    });

    await usuario.type(caixa(), 'Rascunho para a Mariana');
    await usuario.click(screen.getByRole('button', { name: 'ir para oc-2' }));

    await screen.findByText('rui@cliente.com');
    expect((caixa() as HTMLTextAreaElement).value).toMatch(/^Olá, Rui!/);
    expect((caixa() as HTMLTextAreaElement).value).not.toContain('Rascunho');
  });
});

describe('com respostas prontas', () => {
  const MODELOS: RespostaPronta[] = [
    { id: 'm1', titulo: 'Pedido de desculpas', texto: 'Sentimos muito pela demora.', ativo: true, atualizadoEm: '' },
    { id: 'm2', titulo: 'Desativada', texto: 'Não deve aparecer.', ativo: false, atualizadoEm: '' },
  ];
  const seletor = () => screen.getByLabelText('Usar uma resposta pronta') as HTMLSelectElement;

  it('o seletor mostra só as ativas; escolher põe o texto depois da saudação e volta o seletor ao começo', async () => {
    const { usuario } = await abrir({}, MODELOS);

    const opcoes = within(await screen.findByLabelText('Usar uma resposta pronta')).getAllByRole('option');
    expect(opcoes.map((o) => o.textContent)).toEqual(['Escolha para pôr na caixa…', 'Pedido de desculpas']);

    await usuario.selectOptions(seletor(), 'm1');

    expect((caixa() as HTMLTextAreaElement).value).toBe(`${SAUDACAO}\n\nSentimos muito pela demora.`);
    expect(caixa()).toHaveFocus();
    expect(seletor().value).toBe('');
    expect(botaoEnviar()).toBeEnabled();
  });

  it('com algo já escrito, o modelo vai para o fim sem apagar nada', async () => {
    const { usuario } = await abrir({}, MODELOS);
    await usuario.type(caixa(), 'Obrigado por avisar.');

    await usuario.selectOptions(await screen.findByLabelText('Usar uma resposta pronta'), 'm1');

    expect((caixa() as HTMLTextAreaElement).value).toBe(
      `${SAUDACAO}\n\nObrigado por avisar.\n\nSentimos muito pela demora.`
    );
  });

  it('se o modelo fizer passar de 2000 caracteres, o envio espera encurtar', async () => {
    const longo = { ...MODELOS[0], texto: 'x'.repeat(1500) };
    const { usuario } = await abrir({}, [longo]);
    await usuario.selectOptions(await screen.findByLabelText('Usar uma resposta pronta'), 'm1');
    await usuario.selectOptions(seletor(), 'm1');

    expect((caixa() as HTMLTextAreaElement).value.length).toBeGreaterThan(2000);
    expect(screen.getByText(/de 2000: encurte para enviar/)).toBeInTheDocument();
    expect(botaoEnviar()).toBeDisabled();
  });

  it('sem respostas prontas (ou sem a lista), a caixa funciona sem o seletor', async () => {
    await abrir({}, 'sem-rede');
    expect(screen.queryByLabelText('Usar uma resposta pronta')).not.toBeInTheDocument();
    expect(caixa()).toBeInTheDocument();
  });
});

describe('respostas já enviadas', () => {
  it('aparecem em ordem, com quem respondeu', async () => {
    await abrir({
      respondida: true,
      respostas: [RESPOSTA, { ...RESPOSTA, id: 'r-2', texto: 'Segunda mensagem.', autor: { nome: 'Gerente Sinuelo' } }],
    });
    const enviadas = screen.getByRole('region', { name: 'Respostas enviadas' });
    const itens = within(enviadas).getAllByRole('listitem');
    expect(itens[0]).toHaveTextContent('Coordenadora Sinuelo');
    expect(itens[1]).toHaveTextContent('Segunda mensagem.');
  });

  it('texto apagado pela retenção: diz que saiu, mesmo com o contato já apagado', async () => {
    await abrir({
      contato: null,
      contatoApagadoEm: '2026-10-21T18:00:00.000Z',
      respondida: true,
      respostas: [{ ...RESPOSTA, texto: null, textoApagadoEm: '2026-10-21T18:00:00.000Z' }],
    });
    expect(
      screen.getByText(`Texto apagado em ${new Date('2026-10-21T18:00:00.000Z').toLocaleDateString('pt-BR')}, pela política de privacidade.`)
    ).toBeInTheDocument();
    expect(screen.getByText('Coordenadora Sinuelo')).toBeInTheDocument();
  });
});

describe('na lista e no log', () => {
  it('respondida: selo "Respondida" no lugar de "Pediu resposta"', () => {
    render(
      <MemoryRouter>
        <ItemDaOcorrencia ocorrencia={{ ...BASE, respondida: true }} />
      </MemoryRouter>
    );
    expect(screen.getByText('Respondida')).toBeInTheDocument();
    expect(screen.queryByText('Pediu resposta')).not.toBeInTheDocument();
  });

  it('o log diz que houve resposta, com a área; a retenção conta as respostas', () => {
    const registro = {
      id: 'a1',
      acao: 'RESPOSTA_ENVIADA',
      entidade: 'Feedback',
      entidadeId: 'oc-1',
      detalhes: { area: 'Mesa 12' },
      criadoEm: '2026-10-25T19:10:00.000Z',
      usuario: { id: 'u', nome: 'Coordenadora Sinuelo' },
    } as unknown as RegistroDeAuditoria;
    expect(descrever(registro)).toBe('Respondeu por e-mail ao cliente de uma ocorrência (Mesa 12)');
    expect(contagemDaRetencao({ contatos: 2, comentarios: 0, respostas: 1, notificacoes: 3 })).toBe(
      '2 contatos, 1 resposta da equipe e 3 notificações'
    );
  });
});
