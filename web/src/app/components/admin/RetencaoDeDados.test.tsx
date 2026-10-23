import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SecaoRetencao } from './RetencaoDeDados';
import { EVENTO_AVISO_RAPIDO } from '../../avisoRapido';
import { apiFalsa } from '../../../test/apiFalsa';

const CONFIG = {
  duracaoSessaoHoras: 8,
  retencaoContatoDias: 90,
  retencaoComentarioDias: 365,
  retencaoNotificacaoDias: 90,
  ultimaRetencaoEm: '2026-10-23T19:08:00.000Z',
};

function apiDaRetencao(vencido = { contatos: 3, comentarios: 1, notificacoes: 0 }) {
  return apiFalsa()
    .quando('GET /configuracoes', { corpo: CONFIG })
    .quando('GET /retencao/previa', { corpo: { ...vencido, ultimaRetencaoEm: CONFIG.ultimaRetencaoEm } })
    .quando('PATCH /configuracoes', (p) => ({ corpo: { ...CONFIG, ...(p.corpo as object) } }))
    .quando('POST /retencao/aplicar', { corpo: vencido })
    .quando('POST /retencao/titular', { corpo: { feedbacks: 2 } });
}

function abrir() {
  const usuario = userEvent.setup();
  render(<SecaoRetencao token="tok" />);
  return usuario;
}

function ouvirAvisos() {
  const avisos: string[] = [];
  const ouvinte = (e: Event) => avisos.push((e as CustomEvent<string>).detail);
  window.addEventListener(EVENTO_AVISO_RAPIDO, ouvinte);
  return { avisos, parar: () => window.removeEventListener(EVENTO_AVISO_RAPIDO, ouvinte) };
}

const prazoDoContato = () => screen.getByLabelText('Nome e e-mail de quem pede resposta');
const dialogo = () => screen.getByRole('dialog');

describe('retenção de dados nas configurações', () => {
  it('mostra os prazos salvos, a última rodada e o que já passou do prazo', async () => {
    apiDaRetencao();
    abrir();

    expect(await screen.findByText('Pronto para sair: 3 contatos e 1 comentário.')).toBeInTheDocument();
    expect(prazoDoContato()).toHaveValue('90');
    expect(screen.getByLabelText('Comentário')).toHaveValue('365');
    expect(screen.getByLabelText('Notificações')).toHaveValue('90');
    expect(screen.getByText(/^Última vez que rodou: /)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar prazos' })).toBeDisabled();
  });

  it('nada vencido: diz isso e não oferece "Apagar agora"', async () => {
    apiDaRetencao({ contatos: 0, comentarios: 0, notificacoes: 0 });
    abrir();
    expect(await screen.findByText('Nada passou do prazo.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apagar agora' })).not.toBeInTheDocument();
  });

  it('prazo salvo fora das opções (gravado pela API) continua aparecendo', async () => {
    apiDaRetencao().quando('GET /configuracoes', { corpo: { ...CONFIG, retencaoContatoDias: 45 } });
    abrir();
    await screen.findByText(/Pronto para sair/);
    expect(prazoDoContato()).toHaveValue('45');
    expect(within(prazoDoContato()).getByRole('option', { name: '45 dias' })).toBeInTheDocument();
  });

  it('salvar manda só o prazo que mudou; encurtar avisa antes', async () => {
    const api = apiDaRetencao();
    const { avisos, parar } = ouvirAvisos();
    const usuario = abrir();
    await screen.findByText(/Pronto para sair/);

    await usuario.selectOptions(prazoDoContato(), '30');
    expect(screen.getByText(/Encurtar um prazo apaga, na próxima rodada/)).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Salvar prazos' }));

    await waitFor(() => expect(api.pedidosPara('PATCH', '/configuracoes')).toHaveLength(1));
    expect(api.pedidosPara('PATCH', '/configuracoes')[0].corpo).toEqual({ retencaoContatoDias: 30 });
    // A prévia é refeita com os prazos novos.
    await waitFor(() => expect(api.pedidosPara('GET', '/retencao/previa')).toHaveLength(2));
    expect(avisos[0]).toMatch(/^Prazos salvos\. O que já passou do novo prazo sai na próxima rodada/);
    parar();
  });

  it('alongar um prazo não mostra o aviso de encurtar', async () => {
    apiDaRetencao();
    const usuario = abrir();
    await screen.findByText(/Pronto para sair/);
    await usuario.selectOptions(prazoDoContato(), '180');
    expect(screen.queryByText(/Encurtar um prazo/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar prazos' })).toBeEnabled();
  });

  it('"Apagar agora" pede confirmação, com o foco no Cancelar; cancelar não apaga', async () => {
    const api = apiDaRetencao();
    const usuario = abrir();
    await usuario.click(await screen.findByRole('button', { name: 'Apagar agora' }));

    expect(dialogo()).toHaveTextContent('Sai agora: 3 contatos e 1 comentário.');
    expect(within(dialogo()).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    // Enter distraído: cai no Cancelar.
    await usuario.keyboard('{Enter}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.pedidosPara('POST', '/retencao/aplicar')).toHaveLength(0);
  });

  it('confirmar aplica, avisa quanto saiu e atualiza a tela', async () => {
    const api = apiDaRetencao();
    const { avisos, parar } = ouvirAvisos();
    const usuario = abrir();
    await usuario.click(await screen.findByRole('button', { name: 'Apagar agora' }));

    api.quando('GET /retencao/previa', { corpo: { contatos: 0, comentarios: 0, notificacoes: 0, ultimaRetencaoEm: '2026-10-23T20:00:00.000Z' } });
    await usuario.click(within(dialogo()).getByRole('button', { name: 'Apagar agora' }));

    expect(await screen.findByText('Nada passou do prazo.')).toBeInTheDocument();
    expect(api.pedidosPara('POST', '/retencao/aplicar')).toHaveLength(1);
    expect(avisos).toEqual(['Apagado: 3 contatos e 1 comentário.']);
    parar();
  });

  it('pedido do cliente: confirma com o e-mail, manda sem espaços e diz quantas avaliações saíram', async () => {
    const api = apiDaRetencao();
    const usuario = abrir();
    await screen.findByText(/Pronto para sair/);
    const campo = screen.getByLabelText('E-mail do cliente');
    const apagar = screen.getByRole('button', { name: 'Apagar dados' });

    expect(apagar).toBeDisabled();
    await usuario.type(campo, 'sem-arroba');
    expect(apagar).toBeDisabled();
    await usuario.clear(campo);
    await usuario.type(campo, '  Ana@Exemplo.com ');
    await usuario.click(apagar);

    expect(dialogo()).toHaveTextContent('todas as avaliações de Ana@Exemplo.com');
    await usuario.click(within(dialogo()).getByRole('button', { name: 'Apagar dados' }));

    expect(
      await screen.findByText('Pronto: o nome, o e-mail e o comentário de 2 avaliações de Ana@Exemplo.com foram apagados.')
    ).toBeInTheDocument();
    expect(api.pedidosPara('POST', '/retencao/titular')[0].corpo).toEqual({ email: 'Ana@Exemplo.com' });
    expect(campo).toHaveValue('');
  });

  it('pedido do cliente sem nenhuma avaliação: diz isso e deixa o e-mail no campo para corrigir', async () => {
    apiDaRetencao().quando('POST /retencao/titular', { corpo: { feedbacks: 0 } });
    const usuario = abrir();
    await screen.findByText(/Pronto para sair/);
    await usuario.type(screen.getByLabelText('E-mail do cliente'), 'ninguem@x.com');
    await usuario.click(screen.getByRole('button', { name: 'Apagar dados' }));
    await usuario.click(within(dialogo()).getByRole('button', { name: 'Apagar dados' }));

    expect(await screen.findByText(/^Nenhuma avaliação com o e-mail ninguem@x\.com\./)).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail do cliente')).toHaveValue('ninguem@x.com');
  });

  it('uma mudança de prazo ainda não salva sobrevive ao pedido do cliente', async () => {
    apiDaRetencao();
    const usuario = abrir();
    await screen.findByText(/Pronto para sair/);
    await usuario.selectOptions(prazoDoContato(), '180');
    await usuario.type(screen.getByLabelText('E-mail do cliente'), 'ana@x.com');
    await usuario.click(screen.getByRole('button', { name: 'Apagar dados' }));
    await usuario.click(within(dialogo()).getByRole('button', { name: 'Apagar dados' }));

    await screen.findByText(/^Pronto: /);
    expect(prazoDoContato()).toHaveValue('180');
  });

  it('falha ao apagar: mensagem, e nada fica pela metade na tela', async () => {
    apiDaRetencao().quando('POST /retencao/aplicar', { status: 500, corpo: { erro: 'Erro interno do servidor' } });
    const usuario = abrir();
    await usuario.click(await screen.findByRole('button', { name: 'Apagar agora' }));
    await usuario.click(within(dialogo()).getByRole('button', { name: 'Apagar agora' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno do servidor');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Pronto para sair: 3 contatos e 1 comentário.')).toBeInTheDocument();
  });

  it('apagou, mas a tela não conseguiu se atualizar: diz que apagou, não que falhou', async () => {
    const api = apiDaRetencao();
    const usuario = abrir();
    await usuario.click(await screen.findByRole('button', { name: 'Apagar agora' }));
    api.quando('GET /retencao/previa', 'sem-rede');
    await usuario.click(within(dialogo()).getByRole('button', { name: 'Apagar agora' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Apagado: 3 contatos e 1 comentário, mas a tela não conseguiu se atualizar. Recarregue a página para ver como ficou.'
    );
    expect(api.pedidosPara('POST', '/retencao/aplicar')).toHaveLength(1);
  });

  it('salvou os prazos, mas a tela não conseguiu se atualizar: diz que salvou', async () => {
    const api = apiDaRetencao();
    const usuario = abrir();
    await screen.findByText(/Pronto para sair/);
    await usuario.selectOptions(prazoDoContato(), '180');
    api.quando('GET /retencao/previa', 'sem-rede');
    await usuario.click(screen.getByRole('button', { name: 'Salvar prazos' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/^Prazos salvos, mas a tela não conseguiu se atualizar/);
  });

  it('com um prazo mudado e não salvo, avisa que a conta segue os prazos salvos', async () => {
    apiDaRetencao();
    const usuario = abrir();
    await screen.findByText(/Pronto para sair/);
    expect(screen.queryByText(/Contado com os prazos salvos/)).not.toBeInTheDocument();
    await usuario.selectOptions(prazoDoContato(), '30');
    expect(screen.getByText('Contado com os prazos salvos. Salve os novos para a conta mudar.')).toBeInTheDocument();
  });

  it('falha ao carregar: mensagem e "Tentar de novo"', async () => {
    const api = apiDaRetencao().quando('GET /retencao/previa', 'sem-rede');
    const usuario = abrir();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível conectar ao servidor');

    api.quando('GET /retencao/previa', { corpo: { contatos: 0, comentarios: 0, notificacoes: 0, ultimaRetencaoEm: null } });
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Nada passou do prazo.')).toBeInTheDocument();
  });
});

