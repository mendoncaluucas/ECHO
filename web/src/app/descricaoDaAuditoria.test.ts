import { describe, expect, it } from 'vitest';
import { descrever, nomeDeQuemFez } from './descricaoDaAuditoria';
import type { AcaoAuditoria, RegistroDeAuditoria } from './services/api';

function registro(acao: AcaoAuditoria, detalhes: Record<string, unknown> | null, usuario: RegistroDeAuditoria['usuario'] = null): RegistroDeAuditoria {
  return { id: 'r1', acao, entidade: 'Configuracao', entidadeId: 'sistema', detalhes, criadoEm: '2026-10-21T12:00:00Z', usuario };
}

describe('log de atividades: retenção de dados (LGPD)', () => {
  it('sem usuário é o próprio Echo, e não quebra a tela', () => {
    expect(nomeDeQuemFez(registro('RETENCAO_APLICADA', {}))).toBe('Sistema (automático)');
    expect(nomeDeQuemFez(registro('LOGIN', null, { id: 'u1', nome: 'Ana' }))).toBe('Ana');
  });

  it.each([
    [{ contatos: 3, comentarios: 1, notificacoes: 5 }, 'Apagou o que passou do prazo de retenção: 3 contatos, 1 comentário e 5 notificações'],
    [{ contatos: 1, comentarios: 0, notificacoes: 0 }, 'Apagou o que passou do prazo de retenção: 1 contato'],
    [{ contatos: 0, comentarios: 2, notificacoes: 1 }, 'Apagou o que passou do prazo de retenção: 2 comentários e 1 notificação'],
    [{ contatos: 0, comentarios: 0, notificacoes: 0 }, 'Aplicou a retenção: nada tinha passado do prazo'],
    // Registro sem os números (de uma versão futura ou estragado) não quebra.
    [null, 'Aplicou a retenção: nada tinha passado do prazo'],
  ])('retenção aplicada %j', (detalhes, frase) => {
    expect(descrever(registro('RETENCAO_APLICADA', detalhes))).toBe(frase);
  });

  it.each([
    [{ feedbacks: 2 }, 'Apagou, a pedido do cliente, o contato e o comentário de 2 avaliações'],
    [{ feedbacks: 1 }, 'Apagou, a pedido do cliente, o contato e o comentário de 1 avaliação'],
    [{ feedbacks: 0 }, 'Pedido de cliente para apagar os dados: nenhuma avaliação com aquele e-mail'],
  ])('pedido do cliente %j', (detalhes, frase) => {
    expect(descrever(registro('DADOS_DO_TITULAR_APAGADOS', detalhes))).toBe(frase);
  });

  it.each([
    [{ campo: 'duracaoSessaoHoras', de: 8, para: 4 }, 'Alterou o tempo de sessão de 8h para 4h'],
    [{ campo: 'retencaoContatoDias', de: 90, para: 60 }, 'Alterou por quanto tempo o contato do cliente fica de 90 dias para 60 dias'],
    [{ campo: 'retencaoComentarioDias', de: 365, para: 730 }, 'Alterou por quanto tempo o comentário fica de 365 dias para 730 dias'],
    [{ campo: 'outraCoisa', de: 1, para: 2 }, 'Alterou a configuração "outraCoisa" de 1 para 2'],
  ])('configuração alterada %j', (detalhes, frase) => {
    expect(descrever(registro('CONFIGURACAO_ALTERADA', detalhes, { id: 'u1', nome: 'Ana' }))).toBe(frase);
  });
});
