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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const erro = new Error(data?.erro ?? `Erro ${res.status}`) as Error & {
      status?: number;
      codigo?: string;
    };
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

export function listarOcorrencias(
  token: string
): Promise<{ itens: Ocorrencia[] }> {
  return request(`/occurrences`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export interface Area {
  id: string;
  nome: string;
  venue: { nome: string };
}

export function listarAreas(): Promise<{ itens: Area[] }> {
  return request(`/areas`);
}

export interface QRCodeGerado {
  id: string;
  token: string;
  url: string;
  imagem: string;
}

export function gerarQRCode(areaId: string): Promise<QRCodeGerado> {
  return request(`/qrcodes`, {
    method: "POST",
    body: JSON.stringify({ areaId }),
  });
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
