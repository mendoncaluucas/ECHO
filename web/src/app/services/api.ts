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

export interface Ocorrencia {
  id: string;
  tipo: TipoFeedback;
  comentario: string | null;
  anonimo: boolean;
  criadoEm: string;
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
