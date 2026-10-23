import { vi } from 'vitest';
import { salvarSessao, type Papel, type Usuario } from '../app/services/api';

// A API nos testes do front: troca o fetch por uma tabela de respostas e guarda cada
// pedido, para o teste conferir o que a tela mandou (filtros, corpo, token).

export interface Pedido {
  metodo: string;
  // Sem o prefixo /api: "/occurrences", "/public/feedback".
  caminho: string;
  busca: URLSearchParams;
  corpo: unknown;
  autorizacao: string | null;
}

interface Resposta {
  status?: number;
  corpo?: unknown;
}

// Uma resposta fixa, uma função do pedido, ou 'sem-rede' (o fetch rejeita, como com a
// API fora do ar). Uma Promise que nunca resolve simula o servidor acordando.
type Responder = Resposta | 'sem-rede' | ((pedido: Pedido) => Resposta | Promise<Resposta>);

export function apiFalsa() {
  const rotas = new Map<string, Responder>();
  const pedidos: Pedido[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(entrada));
      const pedido: Pedido = {
        metodo: (init.method ?? 'GET').toUpperCase(),
        caminho: url.pathname.replace(/^\/api/, ''),
        busca: url.searchParams,
        corpo: init.body ? JSON.parse(String(init.body)) : undefined,
        autorizacao: new Headers(init.headers).get('Authorization'),
      };
      pedidos.push(pedido);

      const responder =
        rotas.get(`${pedido.metodo} ${pedido.caminho}`) ??
        // Prefixo com * no fim: "GET /occurrences/*" vale para qualquer id.
        [...rotas].find(([rota]) => rota.endsWith('*') && `${pedido.metodo} ${pedido.caminho}`.startsWith(rota.slice(0, -1)))?.[1] ??
        rotas.get('*');
      if (responder === 'sem-rede') throw new TypeError('Failed to fetch');
      const { status = 200, corpo = null } = !responder
        ? { status: 404, corpo: { erro: `Rota não simulada: ${pedido.metodo} ${pedido.caminho}` } }
        : typeof responder === 'function'
          ? await responder(pedido)
          : responder;
      return new Response(corpo === null ? null : JSON.stringify(corpo), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    })
  );

  return {
    // "GET /public/venue/MESA12", "POST /public/feedback", "GET /occurrences/*" ou "*".
    quando(rota: string, responder: Responder) {
      rotas.set(rota, responder);
      return this;
    },
    pedidos,
    pedidosPara(metodo: string, caminho: string) {
      return pedidos.filter((p) => p.metodo === metodo && p.caminho === caminho);
    },
  };
}

export const USUARIOS: Record<Papel, Usuario> = {
  COORDENADOR: { id: 'u-coord', nome: 'Coordenadora Sinuelo', papel: 'COORDENADOR' },
  GERENTE: { id: 'u-ger', nome: 'Gerente Sinuelo', papel: 'GERENTE' },
  ADMINISTRADOR: { id: 'u-admin', nome: 'Administrador Echo', papel: 'ADMINISTRADOR' },
};

// Um token com o formato de um JWT (só o `iat` importa para a tela).
export function tokenFalso(emitidoHaHoras = 0) {
  const iat = Math.floor(Date.now() / 1000 - emitidoHaHoras * 3600);
  return `cabecalho.${btoa(JSON.stringify({ iat }))}.assinatura`;
}

export function entrarComo(papel: Papel, manterConectado = false) {
  salvarSessao(tokenFalso(), USUARIOS[papel], manterConectado);
}
