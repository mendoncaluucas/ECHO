import type { AcaoAuditoria, RegistroDeAuditoria } from './services/api';

// Como cada registro do log de auditoria vira texto. Usado pela tela do log e pela
// atividade recente da visão geral do administrador.

export const ROTULO_ACAO: Record<AcaoAuditoria, string> = {
  LOGIN: 'Login',
  SENHA_ALTERADA: 'Troca da própria senha',
  SENHA_REDEFINIDA: 'Redefinição de senha',
  USUARIO_CRIADO: 'Usuário criado',
  USUARIO_EDITADO: 'Usuário editado',
  USUARIO_DESATIVADO: 'Usuário desativado',
  USUARIO_REATIVADO: 'Usuário reativado',
  AREA_CRIADA: 'Área cadastrada',
  AREA_RENOMEADA: 'Área renomeada',
  AREA_DESATIVADA: 'Área desativada',
  AREA_REATIVADA: 'Área reativada',
  QRCODE_GERADO: 'QR Code gerado',
  QRCODE_DESATIVADO: 'QR Code desativado',
  QRCODE_REATIVADO: 'QR Code reativado',
  OCORRENCIA_STATUS: 'Status de ocorrência',
  CONFIGURACAO_ALTERADA: 'Configuração alterada',
  RETENCAO_APLICADA: 'Retenção de dados',
  DADOS_DO_TITULAR_APAGADOS: 'Dados de cliente apagados',
  AVISO_POR_EMAIL_ALTERADO: 'Avisos por e-mail',
};

// As opções do aviso por e-mail, para a frase do log.
const AVISO_POR_EMAIL: Record<string, string> = {
  NENHUM: 'nenhum',
  RECLAMACOES: 'só reclamações',
  TODOS: 'todos os feedbacks',
};

// Quem fez. Sem usuário é o próprio Echo, sozinho: hoje só a retenção automática.
export function nomeDeQuemFez(registro: RegistroDeAuditoria): string {
  return registro.usuario?.nome ?? 'Sistema (automático)';
}

// Prazos de retenção e a sessão, para a frase da configuração alterada.
const CONFIGURACAO: Record<string, { nome: string; unidade: string }> = {
  duracaoSessaoHoras: { nome: 'o tempo de sessão', unidade: 'h' },
  retencaoContatoDias: { nome: 'por quanto tempo o contato do cliente fica', unidade: ' dias' },
  retencaoComentarioDias: { nome: 'por quanto tempo o comentário fica', unidade: ' dias' },
  retencaoNotificacaoDias: { nome: 'por quanto tempo as notificações ficam', unidade: ' dias' },
};

// "1 contato", "3 contatos". Número que não veio (registro antigo) conta como 0.
function quantos(detalhes: Record<string, unknown> | null, chave: string, um: string, varios: string) {
  const n = Number(detalhes?.[chave]) || 0;
  return `${n} ${n === 1 ? um : varios}`;
}

// "a, b e c", só com o que não é zero.
function lista(partes: string[]) {
  const comAlgo = partes.filter((p) => !p.startsWith('0 '));
  if (comAlgo.length <= 1) return comAlgo.join('');
  return `${comAlgo.slice(0, -1).join(', ')} e ${comAlgo[comAlgo.length - 1]}`;
}

// O que a retenção apagou (ou apagaria): "3 contatos, 1 comentário e 5 notificações".
// Vazio quando é tudo zero. Usado pelo log e pela tela de configurações.
export function contagemDaRetencao(contagem: object | null) {
  const r = contagem as Record<string, unknown> | null;
  return lista([
    quantos(r, 'contatos', 'contato', 'contatos'),
    quantos(r, 'comentarios', 'comentário', 'comentários'),
    quantos(r, 'notificacoes', 'notificação', 'notificações'),
  ]);
}

const ROTULO_VALOR: Record<string, string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  RESOLVIDO: 'Resolvido',
  COORDENADOR: 'Coordenador',
  GERENTE: 'Gerente',
  ADMINISTRADOR: 'Administrador',
};

const ROTULO_CAMPO: Record<string, string> = {
  nome: 'nome',
  email: 'e-mail',
  papel: 'papel',
  setor: 'setor',
};

// `detalhes` vem do banco como JSON livre: um registro antigo, de antes de algum campo
// existir, não pode derrubar a tela. Tudo que se lê dele passa por aqui.
function ler(detalhes: Record<string, unknown> | null, chave: string): string {
  const valor = detalhes?.[chave];
  if (valor === null || valor === undefined || valor === '') return '—';
  const texto = String(valor);
  return ROTULO_VALOR[texto] ?? texto;
}

function descreverAlteracoes(detalhes: Record<string, unknown> | null) {
  const alteracoes = detalhes?.alteracoes;
  if (!alteracoes || typeof alteracoes !== 'object') return '';

  // Campo limpo (setor apagado, por exemplo) aparece como "vazio", sem aspas —
  // entre aspas pareceria um valor de verdade.
  const entreAspas = (valor: string) => (valor === '—' ? 'vazio' : `"${valor}"`);

  return Object.entries(alteracoes as Record<string, Record<string, unknown>>)
    .map(([nomeDoCampo, mudanca]) => {
      const de = entreAspas(ler(mudanca, 'de'));
      const para = entreAspas(ler(mudanca, 'para'));
      return `${ROTULO_CAMPO[nomeDoCampo] ?? nomeDoCampo} de ${de} para ${para}`;
    })
    .join('; ');
}

// A frase que aparece na coluna "Ação". O registro guarda dados, não texto pronto,
// para a redação poder mudar sem reescrever o histórico.
export function descrever(registro: RegistroDeAuditoria): string {
  const d = registro.detalhes;

  switch (registro.acao) {
    case 'LOGIN':
      return 'Entrou no sistema';
    case 'SENHA_ALTERADA':
      return 'Alterou a própria senha';
    case 'SENHA_REDEFINIDA':
      return `Redefiniu a senha de ${ler(d, 'nome')}`;
    case 'USUARIO_CRIADO':
      return `Criou o usuário ${ler(d, 'nome')} (${ler(d, 'papel')})`;
    case 'USUARIO_EDITADO': {
      const alteracoes = descreverAlteracoes(d);
      return `Editou o usuário ${ler(d, 'nome')}${alteracoes ? `: ${alteracoes}` : ''}`;
    }
    case 'USUARIO_DESATIVADO':
      return `Desativou o usuário ${ler(d, 'nome')}`;
    case 'USUARIO_REATIVADO':
      return `Reativou o usuário ${ler(d, 'nome')}`;
    case 'AREA_CRIADA':
      return `Cadastrou a área "${ler(d, 'nome')}"`;
    case 'AREA_RENOMEADA':
      return `Renomeou a área "${ler(d, 'de')}" para "${ler(d, 'para')}"`;
    case 'AREA_DESATIVADA':
      return `Desativou a área "${ler(d, 'nome')}"`;
    case 'AREA_REATIVADA':
      return `Reativou a área "${ler(d, 'nome')}"`;
    case 'QRCODE_GERADO':
      return `Gerou QR Code para "${ler(d, 'area')}"`;
    case 'QRCODE_DESATIVADO':
      return d?.motivo === 'substituido'
        ? `Substituiu o QR Code de "${ler(d, 'area')}" por um novo`
        : `Desativou um QR Code de "${ler(d, 'area')}"`;
    case 'QRCODE_REATIVADO':
      return `Reativou um QR Code de "${ler(d, 'area')}"`;
    case 'OCORRENCIA_STATUS': {
      const area = ler(d, 'area');
      return `Mudou o status de uma ocorrência${area !== '—' ? ` (${area})` : ''}: ${ler(d, 'de')} → ${ler(d, 'para')}`;
    }
    case 'CONFIGURACAO_ALTERADA': {
      // Campo que o front ainda não conhece cai na frase genérica.
      const campo = CONFIGURACAO[String(d?.campo)];
      return campo
        ? `Alterou ${campo.nome} de ${ler(d, 'de')}${campo.unidade} para ${ler(d, 'para')}${campo.unidade}`
        : `Alterou a configuração "${ler(d, 'campo')}" de ${ler(d, 'de')} para ${ler(d, 'para')}`;
    }
    case 'RETENCAO_APLICADA': {
      const apagado = contagemDaRetencao(d);
      return apagado
        ? `Apagou o que passou do prazo de retenção: ${apagado}`
        : 'Aplicou a retenção: nada tinha passado do prazo';
    }
    case 'DADOS_DO_TITULAR_APAGADOS': {
      const n = Number(d?.feedbacks) || 0;
      return n === 0
        ? 'Pedido de cliente para apagar os dados: nenhuma avaliação com aquele e-mail'
        : `Apagou, a pedido do cliente, o contato e o comentário de ${quantos(d, 'feedbacks', 'avaliação', 'avaliações')}`;
    }
    case 'AVISO_POR_EMAIL_ALTERADO': {
      const opcao = (chave: string) => AVISO_POR_EMAIL[String(d?.[chave])] ?? ler(d, chave);
      return `Mudou os próprios avisos por e-mail: ${opcao('de')} → ${opcao('para')}`;
    }
    default:
      // Ação nova no backend que o front ainda não conhece: mostra o código cru
      // em vez de quebrar.
      return registro.acao;
  }
}
