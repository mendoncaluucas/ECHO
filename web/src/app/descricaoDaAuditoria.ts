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
};

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
    case 'CONFIGURACAO_ALTERADA':
      // Hoje só existe a duração da sessão; outro campo cai na frase genérica.
      return d?.campo === 'duracaoSessaoHoras'
        ? `Alterou o tempo de sessão de ${ler(d, 'de')}h para ${ler(d, 'para')}h`
        : `Alterou a configuração "${ler(d, 'campo')}" de ${ler(d, 'de')} para ${ler(d, 'para')}`;
    default:
      // Ação nova no backend que o front ainda não conhece: mostra o código cru
      // em vez de quebrar.
      return registro.acao;
  }
}
