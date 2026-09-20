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
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.erro ?? `Erro ${res.status}`);
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
