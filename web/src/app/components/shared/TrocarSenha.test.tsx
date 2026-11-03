import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TrocarSenha } from './TrocarSenha';
import { apiFalsa, entrarComo } from '../../../test/apiFalsa';
import { sessaoAtual, tokenDaSessao } from '../../services/api';

function abrir() {
  entrarComo('COORDENADOR');
  const usuario = userEvent.setup();
  render(<TrocarSenha />);
  return usuario;
}

const botao = () => screen.getByRole('button', { name: 'Trocar senha' });

async function preencher(
  usuario: ReturnType<typeof userEvent.setup>,
  { atual = 'senha-antiga', nova = 'senha-nova-123', confirmacao }: { atual?: string; nova?: string; confirmacao?: string } = {}
) {
  confirmacao ??= nova;
  if (atual) await usuario.type(screen.getByLabelText('Senha atual'), atual);
  if (nova) await usuario.type(screen.getByLabelText('Nova senha'), nova);
  if (confirmacao) await usuario.type(screen.getByLabelText('Repita a nova senha'), confirmacao);
}

describe('Trocar minha senha', () => {
  it('troca, guarda o token novo que a API devolve e diz que as outras sessões caíram', async () => {
    const api = apiFalsa().quando('PATCH /auth/senha', { corpo: { token: 'token-depois-da-troca' } });
    const usuario = abrir();
    const tokenAntes = tokenDaSessao();
    const quemEstaLogado = sessaoAtual()!.usuario;

    await preencher(usuario);
    await usuario.click(botao());

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Senha trocada. As outras sessões com a sua conta foram encerradas.'
    );
    const [pedido] = api.pedidosPara('PATCH', '/auth/senha');
    expect(pedido.corpo).toEqual({ senhaAtual: 'senha-antiga', novaSenha: 'senha-nova-123' });
    expect(pedido.autorizacao).toBe(`Bearer ${tokenAntes}`);
    // Esta sessão continua, com o token novo e a mesma pessoa.
    expect(sessaoAtual()).toEqual({ token: 'token-depois-da-troca', usuario: quemEstaLogado });
    // Os campos se esvaziam: a senha não fica na tela.
    expect(screen.getByLabelText('Senha atual')).toHaveValue('');
    expect(screen.getByLabelText('Nova senha')).toHaveValue('');
  });

  it('API ainda na versão de antes (204, sem token, na janela do deploy): diz que trocou e mantém a sessão', async () => {
    apiFalsa().quando('PATCH /auth/senha', { status: 204 });
    const usuario = abrir();
    const antes = sessaoAtual();

    await preencher(usuario);
    await usuario.click(botao());

    expect(await screen.findByRole('status')).toHaveTextContent('Senha trocada.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(sessaoAtual()).toEqual(antes);
  });

  it('só libera o botão com a atual, uma nova de 8 ou mais e a repetição igual', async () => {
    const api = apiFalsa();
    const usuario = abrir();
    expect(botao()).toBeDisabled();

    await preencher(usuario, { nova: 'curta', confirmacao: 'curta' });
    expect(botao()).toBeDisabled();
    expect(screen.getByText('Pelo menos 8 caracteres.')).toHaveClass('text-atencao');

    await usuario.clear(screen.getByLabelText('Nova senha'));
    await usuario.type(screen.getByLabelText('Nova senha'), 'senha-nova-123');
    expect(screen.getByText('As duas não são iguais.')).toBeInTheDocument();
    expect(botao()).toBeDisabled();

    await usuario.clear(screen.getByLabelText('Repita a nova senha'));
    await usuario.type(screen.getByLabelText('Repita a nova senha'), 'senha-nova-123');
    expect(botao()).toBeEnabled();
    expect(api.pedidos).toHaveLength(0);
  });

  it('a nova igual à atual não deixa enviar e diz por quê', async () => {
    const usuario = abrir();
    await preencher(usuario, { atual: 'mesma-senha-1', nova: 'mesma-senha-1' });
    expect(screen.getByText('A nova senha precisa ser diferente da atual.')).toBeInTheDocument();
    expect(botao()).toBeDisabled();
  });

  it('senha atual errada: diz que não confere e não mexe na sessão', async () => {
    apiFalsa().quando('PATCH /auth/senha', {
      status: 401,
      corpo: { erro: 'Senha atual incorreta', codigo: 'CREDENCIAIS_INVALIDAS' },
    });
    const usuario = abrir();
    const antes = sessaoAtual();

    await preencher(usuario);
    await usuario.click(botao());

    expect(await screen.findByRole('alert')).toHaveTextContent('A senha atual não confere.');
    expect(sessaoAtual()).toEqual(antes);
    // O que foi digitado fica, para corrigir só a atual.
    expect(screen.getByLabelText('Nova senha')).toHaveValue('senha-nova-123');
  });

  it('muitas tentativas (429): a mensagem da API, que diz quanto esperar', async () => {
    apiFalsa().quando('PATCH /auth/senha', {
      status: 429,
      corpo: {
        erro: 'Muitas tentativas de trocar a senha. Tente de novo em 14 minutos.',
        codigo: 'MUITAS_REQUISICOES',
        tenteEmSegundos: 820,
      },
    });
    const usuario = abrir();
    await preencher(usuario);
    await usuario.click(botao());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Muitas tentativas de trocar a senha. Tente de novo em 14 minutos.'
    );
  });

  it('sem conexão: diz que é a conexão', async () => {
    apiFalsa().quando('PATCH /auth/senha', 'sem-rede');
    const usuario = abrir();
    await preencher(usuario);
    await usuario.click(botao());
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível conectar ao servidor.');
  });

  it('mexer num campo depois de trocar tira o aviso de sucesso', async () => {
    apiFalsa().quando('PATCH /auth/senha', { corpo: { token: 'novo' } });
    const usuario = abrir();
    await preencher(usuario);
    await usuario.click(botao());
    await screen.findByRole('status');

    await usuario.type(screen.getByLabelText('Senha atual'), 'x');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
