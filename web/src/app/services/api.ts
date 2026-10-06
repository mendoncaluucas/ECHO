const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333/api";

export type TipoFeedback = "ELOGIO" | "SUGESTAO" | "RECLAMACAO";

export interface Categoria {
  id: string;
  nome: string;
}

export interface VenueContext {
  venue: { id: string; nome: string };
  area: { id: string; nome: string };
  categorias: Categoria[];
}

export interface FeedbackPayload {
  qrToken: string;
  tipo: TipoFeedback;
  comentario?: string;
  anonimo: boolean;
  contatoEmail?: string | null;
  avaliacoes: { categoriaId: string; estrelas: number }[];
}

type ErroDaApi = Error & { status?: number; codigo?: string };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;

  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    });
  } catch {
    // O fetch só rejeita quando a requisição nem chega ao servidor: API fora do ar,
    // rede caída ou CORS. A mensagem nativa é "Failed to fetch", que as telas exibiam
    // cru para o usuário. Sem status, porque não houve resposta HTTP.
    const erro = new Error(
      "Não foi possível conectar ao servidor. Tente novamente em alguns instantes."
    ) as ErroDaApi;
    erro.codigo = "SEM_CONEXAO";
    throw erro;
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const erro = new Error(data?.erro ?? `Erro ${res.status}`) as ErroDaApi;
    erro.status = res.status;
    erro.codigo = data?.codigo;
    throw erro;
  }
  return data as T;
}

export function getVenue(qrToken: string): Promise<VenueContext> {
  return request(`/public/venue/${encodeURIComponent(qrToken)}`);
}

export function submitFeedback(
  payload: FeedbackPayload
): Promise<{ id: string; criadoEm: string }> {
  return request(`/public/feedback`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type Papel = "GERENTE" | "COORDENADOR" | "ADMINISTRADOR";

export interface Usuario {
  id: string;
  nome: string;
  papel: Papel;
}

export interface LoginResponse {
  token: string;
  usuario: Usuario;
}

export function login(email: string, senha: string): Promise<LoginResponse> {
  return request(`/auth/login`, {
    method: "POST",
    body: JSON.stringify({ email, senha }),
  });
}

export interface AvaliacaoOcorrencia {
  categoria: string;
  estrelas: number;
}

export type StatusOcorrencia = 'PENDENTE' | 'EM_ANDAMENTO' | 'RESOLVIDO';

export interface Ocorrencia {
  id: string;
  tipo: TipoFeedback;
  comentario: string | null;
  anonimo: boolean;
  criadoEm: string;
  status: StatusOcorrencia;
  tratadoEm: string | null;
  tratadoPor: { nome: string } | null;
  area: { nome: string } | null;
  avaliacoes: AvaliacaoOcorrencia[];
}

export interface FiltrosDeOcorrencia {
  pagina?: number;
  porPagina?: number;
  status?: StatusOcorrencia;
  tipo?: TipoFeedback;
  categoria?: string;
  busca?: string;
  de?: string;
  ate?: string;
}

export interface PaginaDeOcorrencias {
  itens: Ocorrencia[];
  total: number;
  pagina: number;
  porPagina: number;
  paginas: number;
}

// Teto do backend. Exportado porque o painel do coordenador carrega de página em
// página e precisa saber o tamanho do passo.
export const MAXIMO_POR_PAGINA = 100;

export function listarOcorrencias(
  token: string,
  filtros: FiltrosDeOcorrencia = {}
): Promise<PaginaDeOcorrencias> {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== '') busca.set(chave, String(valor));
  }
  const query = busca.toString();

  return request(`/occurrences${query ? `?${query}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export interface Area {
  id: string;
  nome: string;
  ativo: boolean;
  venue: { nome: string };
}

// Devolve ativas e inativas. Quem só quer oferecer destino para um QR Code novo
// (o gerador) precisa filtrar pelas ativas.
export function listarAreas(): Promise<{ itens: Area[] }> {
  return request(`/areas`);
}

export function criarArea(nome: string, token: string): Promise<Area> {
  return request(`/areas`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nome }),
  });
}

export function atualizarArea(
  id: string,
  dados: { nome?: string; ativo?: boolean },
  token: string
): Promise<Area> {
  return request(`/areas/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(dados),
  });
}

export interface QRCodeGerado {
  id: string;
  token: string;
  url: string;
  imagem: string;
}

// Exige administrador: a geração entra no log de auditoria, que precisa de um autor.
export function gerarQRCode(areaId: string, token: string): Promise<QRCodeGerado> {
  return request(`/qrcodes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ areaId }),
  });
}

export interface QRCodeCadastrado {
  id: string;
  token: string;
  ativo: boolean;
  criadoEm: string;
  area: { nome: string };
}

export function listarQRCodes(token: string): Promise<{ itens: QRCodeCadastrado[] }> {
  return request(`/qrcodes`, { headers: { Authorization: `Bearer ${token}` } });
}

export function buscarOcorrencia(id: string, token: string): Promise<Ocorrencia> {
  return request(`/occurrences/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function atualizarStatusOcorrencia(
  id: string,
  status: StatusOcorrencia,
  token: string
): Promise<Ocorrencia> {
  return request(`/occurrences/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
}

export interface Metricas {
  periodo: { dias: number; de: string; ate: string };
  resumo: {
    total: number;
    resolvidos: number;
    percentualResolvido: number;
    // null quando ainda não houve tratativa / não há período anterior para comparar.
    tempoMedioTratativaHoras: number | null;
    variacaoPercentual: number | null;
  };
  porStatus: { status: StatusOcorrencia; total: number }[];
  porTipo: { tipo: TipoFeedback; total: number }[];
  porArea: { area: string; total: number }[];
  porCategoria: { categoria: string; total: number; mediaEstrelas: number }[];
}

export function buscarMetricas(dias: number, token: string): Promise<Metricas> {
  return request(`/metrics?dias=${dias}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export interface RelatorioHistorico {
  periodo: { de: string; ate: string };
  resumo: {
    total: number;
    pendentes: number;
    emAndamento: number;
    resolvidos: number;
    percentualResolvido: number;
  };
  meses: {
    mes: string; // YYYY-MM, no fuso do restaurante
    total: number;
    porTipo: Record<TipoFeedback, number>;
    // null quando ninguém avaliou a categoria no mês — não confundir com nota zero.
    categorias: { categoria: string; avaliacoes: number; mediaEstrelas: number | null }[];
  }[];
  porArea: {
    area: string;
    total: number;
    pendentes: number;
    emAndamento: number;
    resolvidos: number;
    percentualResolvido: number;
  }[];
  porCategoria: {
    categoria: string;
    avaliacoes: number;
    mediaEstrelas: number | null;
    mediaAnterior: number | null;
  }[];
}

// Sem datas, a API devolve os últimos 6 meses. Intervalo máximo de 24 meses.
export function buscarRelatorio(
  token: string,
  periodo: { de?: string; ate?: string } = {}
): Promise<RelatorioHistorico> {
  const busca = new URLSearchParams();
  if (periodo.de) busca.set('de', periodo.de);
  if (periodo.ate) busca.set('ate', periodo.ate);
  const query = busca.toString();

  return request(`/metrics/relatorio${query ? `?${query}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export interface UsuarioGestao {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  setor: string | null;
  ativo: boolean;
  criadoEm: string;
}

export interface NovoUsuario {
  nome: string;
  email: string;
  senha: string;
  papel: Papel;
  setor?: string | null;
}

// Todos os campos são opcionais: o PATCH aceita envio parcial.
export type EdicaoUsuario = Partial<Omit<NovoUsuario, 'senha'>> & { ativo?: boolean };

function comAutorizacao(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function listarUsuarios(token: string): Promise<{ itens: UsuarioGestao[] }> {
  return request(`/users`, { headers: comAutorizacao(token) });
}

export function criarUsuario(dados: NovoUsuario, token: string): Promise<UsuarioGestao> {
  return request(`/users`, {
    method: 'POST',
    headers: comAutorizacao(token),
    body: JSON.stringify(dados),
  });
}

export function atualizarUsuario(
  id: string,
  dados: EdicaoUsuario,
  token: string
): Promise<UsuarioGestao> {
  return request(`/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: comAutorizacao(token),
    body: JSON.stringify(dados),
  });
}

// Responde 204 sem corpo; o `request` devolve null nesse caso.
export function redefinirSenha(
  id: string,
  novaSenha: string,
  token: string
): Promise<void> {
  return request(`/users/${encodeURIComponent(id)}/senha`, {
    method: 'PATCH',
    headers: comAutorizacao(token),
    body: JSON.stringify({ novaSenha }),
  });
}

// ---------- Configurações do sistema ----------

export interface Configuracoes {
  duracaoSessaoHoras: number;
}

export function buscarConfiguracoes(token: string): Promise<Configuracoes> {
  return request(`/configuracoes`, { headers: comAutorizacao(token) });
}

export function salvarConfiguracoes(
  dados: Configuracoes,
  token: string
): Promise<Configuracoes> {
  return request(`/configuracoes`, {
    method: 'PATCH',
    headers: comAutorizacao(token),
    body: JSON.stringify(dados),
  });
}

// ---------- Auditoria ----------

export type AcaoAuditoria =
  | 'LOGIN'
  | 'SENHA_ALTERADA'
  | 'SENHA_REDEFINIDA'
  | 'USUARIO_CRIADO'
  | 'USUARIO_EDITADO'
  | 'USUARIO_DESATIVADO'
  | 'USUARIO_REATIVADO'
  | 'AREA_CRIADA'
  | 'AREA_RENOMEADA'
  | 'AREA_DESATIVADA'
  | 'AREA_REATIVADA'
  | 'QRCODE_GERADO'
  | 'OCORRENCIA_STATUS'
  | 'CONFIGURACAO_ALTERADA';

export interface RegistroDeAuditoria {
  id: string;
  acao: AcaoAuditoria;
  entidade: string;
  entidadeId: string;
  // O formato varia por ação — ver a tabela do GET /api/audit no contrato.
  detalhes: Record<string, unknown> | null;
  criadoEm: string;
  usuario: { id: string; nome: string };
}

export interface FiltrosDeAuditoria {
  pagina?: number;
  porPagina?: number;
  usuarioId?: string;
  acao?: AcaoAuditoria;
  de?: string;
  ate?: string;
}

export interface PaginaDeAuditoria {
  itens: RegistroDeAuditoria[];
  total: number;
  pagina: number;
  porPagina: number;
  paginas: number;
}

export function listarAuditoria(
  token: string,
  filtros: FiltrosDeAuditoria = {}
): Promise<PaginaDeAuditoria> {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== '') busca.set(chave, String(valor));
  }
  const query = busca.toString();

  return request(`/audit${query ? `?${query}` : ''}`, { headers: comAutorizacao(token) });
}

// ---------- Notificações ----------

export interface Notificacao {
  id: string;
  lida: boolean;
  criadoEm: string;
  feedback: {
    id: string;
    tipo: TipoFeedback;
    comentario: string | null;
    status: StatusOcorrencia;
    area: { nome: string } | null;
    avaliacoes: AvaliacaoOcorrencia[];
  };
}

export interface PaginaDeNotificacoes {
  itens: Notificacao[];
  total: number;
  naoLidas: number;
  pagina: number;
  porPagina: number;
  paginas: number;
}

export function listarNotificacoes(
  token: string,
  filtros: { pagina?: number; porPagina?: number; lida?: boolean } = {}
): Promise<PaginaDeNotificacoes> {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor !== undefined) busca.set(chave, String(valor));
  }
  const query = busca.toString();

  return request(`/notifications${query ? `?${query}` : ''}`, { headers: comAutorizacao(token) });
}

export function contarNotificacoes(token: string): Promise<{ naoLidas: number }> {
  return request(`/notifications/contagem`, { headers: comAutorizacao(token) });
}

export function marcarNotificacao(id: string, lida: boolean, token: string): Promise<Notificacao> {
  return request(`/notifications/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: comAutorizacao(token),
    body: JSON.stringify({ lida }),
  });
}

export function marcarTodasComoLidas(token: string): Promise<{ atualizadas: number }> {
  return request(`/notifications/marcar-todas-lidas`, {
    method: 'POST',
    headers: comAutorizacao(token),
  });
}

// O sino do cabeçalho e a tela de notificações não se enxergam. Quem muda o "lida"
// avisa por este evento, e o sino reconta na hora em vez de esperar o próximo minuto.
export const EVENTO_NOTIFICACOES = 'echo:notificacoes';

export function avisarMudancaNasNotificacoes() {
  window.dispatchEvent(new Event(EVENTO_NOTIFICACOES));
}

// ---------- Sessão ----------
//
// As três chaves nascem e morrem juntas. Limpar só o token deixava o `echo_usuario`
// desatualizado, e a tela de usuários depende dele para saber quem está logado.

const CHAVES_DA_SESSAO = ['echo_token', 'echo_usuario', 'userRole'];

export function encerrarSessao() {
  for (const chave of CHAVES_DA_SESSAO) {
    try {
      localStorage.removeItem(chave);
    } catch {
      // Navegador com armazenamento bloqueado: não há sessão para encerrar.
    }
  }
}

// Quem está logado, gravado no login. Usado para não oferecer ao administrador
// ações que o backend recusa sobre a própria conta.
export function usuarioLogado(): Usuario | null {
  try {
    const bruto = localStorage.getItem('echo_usuario');
    return bruto ? (JSON.parse(bruto) as Usuario) : null;
  } catch {
    return null;
  }
}

// Há quanto tempo a sessão atual foi aberta, em horas, lida do `iat` do token. Só
// para avisar na tela: quem decide se a sessão vale é o backend.
export function idadeDaSessaoEmHoras(): number | null {
  try {
    const token = localStorage.getItem('echo_token');
    const parte = token?.split('.')[1];
    if (!parte) return null;
    const { iat } = JSON.parse(atob(parte.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof iat === 'number' ? (Date.now() / 1000 - iat) / 3600 : null;
  } catch {
    return null;
  }
}

// Cada papel entra direto na sua área. Os dois formulários de login usam este mapa,
// senão um administrador entrando pela tela do coordenador cairia no painel errado.
export const TELA_INICIAL_POR_PAPEL: Record<Papel, string> = {
  ADMINISTRADOR: '/admin/dashboard',
  GERENTE: '/gerente/dashboard',
  COORDENADOR: '/coordenador/ocorrencias',
};

export function telaInicialDe(papel: Papel): string {
  return TELA_INICIAL_POR_PAPEL[papel] ?? '/gerente/dashboard';
}
