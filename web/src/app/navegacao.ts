import {
  Bell,
  ChartLine,
  LayoutDashboard,
  List,
  MessageSquare,
  QrCode,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Papel } from './services/api';

// Quem pode abrir cada tela da gestão. O menu lateral e a proteção de rotas leem
// esta mesma tabela: se divergissem, o menu ofereceria tela que a rota recusa (ou
// esconderia uma que o papel pode abrir).
//
// O backend continua sendo a autoridade sobre os dados; isto decide só o que a
// interface oferece e o que mostra como "acesso restrito".

export const GESTAO: Papel[] = ['COORDENADOR', 'GERENTE', 'ADMINISTRADOR'];
export const GERENCIA: Papel[] = ['GERENTE', 'ADMINISTRADOR'];
export const ADMINISTRACAO: Papel[] = ['ADMINISTRADOR'];

export interface ItemDoMenu {
  rotulo: string;
  caminho: string;
  icone: LucideIcon;
  papeis: Papel[];
  // Número ao lado do item, vindo do contador do layout.
  contador?: 'pendentes' | 'notificacoes';
}

export interface SecaoDoMenu {
  titulo?: string;
  itens: ItemDoMenu[];
}

export const MENU: SecaoDoMenu[] = [
  {
    itens: [
      { rotulo: 'Painel', caminho: '/gerente/dashboard', icone: LayoutDashboard, papeis: GERENCIA },
      {
        rotulo: 'Ocorrências',
        caminho: '/coordenador/ocorrencias',
        icone: MessageSquare,
        papeis: GESTAO,
        contador: 'pendentes',
      },
      { rotulo: 'Registro', caminho: '/gerente/registro', icone: List, papeis: GERENCIA },
      { rotulo: 'Relatórios', caminho: '/gerente/relatorios', icone: ChartLine, papeis: GERENCIA },
      {
        rotulo: 'Notificações',
        caminho: '/notificacoes',
        icone: Bell,
        papeis: GESTAO,
        contador: 'notificacoes',
      },
    ],
  },
  {
    titulo: 'Administração',
    itens: [
      {
        rotulo: 'Visão geral',
        caminho: '/admin/dashboard',
        icone: LayoutDashboard,
        papeis: ADMINISTRACAO,
      },
      { rotulo: 'Usuários', caminho: '/admin/usuarios', icone: Users, papeis: ADMINISTRACAO },
      { rotulo: 'QR Codes', caminho: '/qr-generator', icone: QrCode, papeis: ADMINISTRACAO },
      {
        rotulo: 'Configurações',
        caminho: '/admin/configuracoes',
        icone: Settings,
        papeis: ADMINISTRACAO,
      },
      {
        rotulo: 'Log de atividades',
        caminho: '/audit-log',
        icone: ScrollText,
        papeis: ADMINISTRACAO,
      },
    ],
  },
];

// O menu de um papel: só as seções que sobram com algum item.
export function menuDo(papel: Papel): SecaoDoMenu[] {
  return MENU.map((secao) => ({
    ...secao,
    itens: secao.itens.filter((item) => item.papeis.includes(papel)),
  })).filter((secao) => secao.itens.length > 0);
}

// Telas que não estão no menu mas pertencem à gestão.
const OUTRAS_ROTAS: { prefixo: string; papeis: Papel[]; rotulo: string }[] = [
  { prefixo: '/coordenador/ocorrencia/', papeis: GESTAO, rotulo: 'Ocorrência' },
];

function itemDaRota(caminho: string) {
  for (const secao of MENU) {
    const item = secao.itens.find((i) => i.caminho === caminho);
    if (item) return item;
  }
  return OUTRAS_ROTAS.find((r) => caminho.startsWith(r.prefixo)) ?? null;
}

// Usado depois do login para voltar à tela onde a sessão caiu, se o papel puder abri-la.
export function papelPodeAbrir(papel: Papel, caminho: string): boolean {
  return itemDaRota(caminho)?.papeis.includes(papel) ?? false;
}

// Nome da tela para o título da aba do navegador.
export function rotuloDaRota(caminho: string): string | null {
  return itemDaRota(caminho)?.rotulo ?? null;
}

export const ROTULO_DO_PAPEL: Record<Papel, string> = {
  COORDENADOR: 'Coordenador',
  GERENTE: 'Gerente',
  ADMINISTRADOR: 'Administrador',
};
