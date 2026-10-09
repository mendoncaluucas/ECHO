import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, SearchX } from 'lucide-react';
import {
  listarCategorias,
  listarOcorrencias,
  tokenDaSessao,
  type Categoria,
  type FiltrosDeOcorrencia,
  type Ocorrencia,
  type StatusOcorrencia,
  type TipoFeedback,
} from '../../services/api';
import { ROTULO_TIPO } from '../../rotulos';
import { AvisoDeErro, CabecalhoDaPagina, Cartao, Esqueleto, EstadoVazio, Pagina } from '../layout/Pagina';
import { ItemDaOcorrencia } from './ItemDaOcorrencia';

const POR_PAGINA = 20;

// A tela é a fila de trabalho: abre nas pendentes. "todas" é pedido explícito.
type Aba = StatusOcorrencia | 'todas';
const ABAS: { valor: Aba; rotulo: string }[] = [
  { valor: 'PENDENTE', rotulo: 'Pendentes' },
  { valor: 'EM_ANDAMENTO', rotulo: 'Em andamento' },
  { valor: 'RESOLVIDO', rotulo: 'Resolvidas' },
  { valor: 'todas', rotulo: 'Todas' },
];
const ABA_PADRAO: Aba = 'PENDENTE';

const TIPOS = Object.keys(ROTULO_TIPO) as TipoFeedback[];

const campoDeSelecao =
  'h-10 w-full rounded-lg border border-border bg-input-background px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto';

type Lista = { itens: Ocorrencia[]; total: number; pagina: number };

export function OccurrencesPanel() {
  const token = tokenDaSessao() ?? '';

  // Filtros no endereço: voltar de uma ocorrência devolve a mesma lista, e o painel do
  // gerente pode mandar para cá já filtrado.
  const [busca, setBusca] = useSearchParams();
  const abaPedida = busca.get('status');
  const aba: Aba = ABAS.some((a) => a.valor === abaPedida) ? (abaPedida as Aba) : ABA_PADRAO;
  const tipoPedido = busca.get('tipo');
  const tipo = TIPOS.includes(tipoPedido as TipoFeedback) ? (tipoPedido as TipoFeedback) : '';
  const categoria = busca.get('categoria') ?? '';

  const mudarFiltro = (chave: 'status' | 'tipo' | 'categoria', valor: string) => {
    const nova = new URLSearchParams(busca);
    const padrao = chave === 'status' ? ABA_PADRAO : '';
    if (valor && valor !== padrao) nova.set(chave, valor);
    else nova.delete(chave);
    setBusca(nova, { replace: true });
  };
  const limparFiltros = () => {
    const nova = new URLSearchParams(busca);
    nova.delete('tipo');
    nova.delete('categoria');
    setBusca(nova, { replace: true });
  };

  const [lista, setLista] = useState<Lista | null>(null);
  const [buscando, setBuscando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [contagens, setContagens] = useState<Record<Aba, number> | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [tentativa, setTentativa] = useState(0);
  // Só a resposta do pedido mais recente vale: trocar de aba rápido não pode deixar a
  // lista de uma aba aparecendo sob o título de outra.
  const pedidoAtual = useRef(0);

  const filtrosDaLista = (pagina: number): FiltrosDeOcorrencia => ({
    pagina,
    porPagina: POR_PAGINA,
    ...(aba !== 'todas' && { status: aba }),
    ...(tipo && { tipo }),
    ...(categoria && { categoria }),
  });

  // Sessão vencida (401) é tratada no serviço da API, que leva ao login.
  useEffect(() => {
    const meu = ++pedidoAtual.current;
    setBuscando(true);
    setErro(null);

    listarOcorrencias(token, filtrosDaLista(1))
      .then((res) => {
        if (meu === pedidoAtual.current) setLista({ itens: res.itens, total: res.total, pagina: 1 });
      })
      .catch((e: Error) => {
        if (meu === pedidoAtual.current) setErro(e.message || 'Não foi possível carregar as ocorrências.');
      })
      .finally(() => {
        if (meu === pedidoAtual.current) setBuscando(false);
      });
    // filtrosDaLista deriva de aba, tipo e categoria, que já estão aqui.
  }, [token, aba, tipo, categoria, tentativa]);

  // Quantas em cada aba, com o tipo e a categoria escolhidos: o número ao lado da aba
  // diz o que se vai ver ao clicar nela.
  useEffect(() => {
    let ativo = true;
    const filtros = { porPagina: 1, ...(tipo && { tipo }), ...(categoria && { categoria }) };
    Promise.all(
      ABAS.map((a) =>
        listarOcorrencias(token, { ...filtros, ...(a.valor !== 'todas' && { status: a.valor }) })
      )
    )
      .then((respostas) => {
        if (!ativo) return;
        setContagens(
          Object.fromEntries(ABAS.map((a, i) => [a.valor, respostas[i].total])) as Record<Aba, number>
        );
      })
      .catch(() => {
        // Contagem é acessória: sem ela as abas só não mostram o número.
      });
    return () => {
      ativo = false;
    };
  }, [token, tipo, categoria, tentativa]);

  useEffect(() => {
    listarCategorias(token)
      .then((res) => setCategorias(res.itens))
      .catch(() => {
        // Sem a lista, o filtro de categoria some; o resto da tela funciona.
      });
  }, [token]);

  const carregarMais = () => {
    if (!lista) return;
    const meu = pedidoAtual.current;
    const proxima = lista.pagina + 1;
    setCarregandoMais(true);
    listarOcorrencias(token, filtrosDaLista(proxima))
      .then((res) => {
        if (meu !== pedidoAtual.current) return;
        setLista((atual) =>
          atual ? { itens: [...atual.itens, ...res.itens], total: res.total, pagina: proxima } : atual
        );
      })
      .catch((e: Error) => {
        if (meu === pedidoAtual.current) setErro(e.message || 'Não foi possível carregar mais.');
      })
      .finally(() => setCarregandoMais(false));
  };

  const temFiltro = Boolean(tipo || categoria);

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo="Ocorrências"
        descricao="Os feedbacks que chegaram pelas mesas. Abra uma para tratar."
      />

      <div className="mb-4 flex flex-col gap-3">
        {/* Rola de lado no celular em vez de quebrar em duas linhas. A barra de rolagem
            fica escondida: a aba cortada na borda já mostra que há mais. */}
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <div role="group" aria-label="Situação" className="inline-flex gap-1 rounded-xl bg-muted p-1">
            {ABAS.map((a) => {
              const escolhida = a.valor === aba;
              const quantidade = contagens?.[a.valor];
              return (
                <button
                  key={a.valor}
                  type="button"
                  aria-pressed={escolhida}
                  onClick={() => mudarFiltro('status', a.valor)}
                  className={`inline-flex h-9 flex-none items-center gap-2 rounded-[9px] px-3.5 text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    escolhida
                      ? 'bg-card font-bold text-foreground shadow-sm'
                      : 'font-semibold text-[#3a3f4a] hover:text-foreground'
                  }`}
                >
                  {a.rotulo}
                  {quantidade !== undefined && (
                    <span
                      className={`min-w-6 rounded-full px-1.5 text-center text-xs leading-5 font-bold tabular-nums ${
                        a.valor === 'PENDENTE' && quantidade > 0
                          ? 'bg-perigo-fundo text-perigo'
                          : 'bg-[#e2e2dc] text-[#3a3f4a]'
                      }`}
                    >
                      {quantidade}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Lado a lado também no celular: empilhados, empurravam a lista para baixo da dobra. */}
        <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-bold text-muted-foreground">Tipo</span>
            <select value={tipo} onChange={(e) => mudarFiltro('tipo', e.target.value)} className={campoDeSelecao}>
              <option value="">Todos os tipos</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO[t]}
                </option>
              ))}
            </select>
          </label>
          {categorias.length > 0 && (
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-bold text-muted-foreground">Categoria avaliada</span>
              <select
                value={categoria}
                onChange={(e) => mudarFiltro('categoria', e.target.value)}
                className={campoDeSelecao}
              >
                <option value="">Todas as categorias</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.nome}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          {temFiltro && (
            <button
              type="button"
              onClick={limparFiltros}
              className="col-span-2 h-10 justify-self-start rounded-lg px-2 text-sm font-bold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {erro ? (
        <AvisoDeErro mensagem={erro} aoTentarDeNovo={() => setTentativa((t) => t + 1)} />
      ) : !lista ? (
        <Cartao>
          <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando ocorrências">
            {[0, 1, 2, 3, 4].map((i) => (
              <Esqueleto key={i} className="h-16" />
            ))}
          </div>
        </Cartao>
      ) : lista.itens.length === 0 ? (
        <ListaVazia
          aba={aba}
          temFiltro={temFiltro}
          aoLimpar={limparFiltros}
          aoVerTodas={() => mudarFiltro('status', 'todas')}
        />
      ) : (
        <div aria-busy={buscando} className={`transition-opacity ${buscando ? 'opacity-60' : ''}`}>
          <Cartao>
            <ul className="-my-1 divide-y divide-[#efefea]">
              {lista.itens.map((o) => (
                <li key={o.id}>
                  <ItemDaOcorrencia ocorrencia={o} />
                </li>
              ))}
            </ul>
          </Cartao>

          <div className="mt-4 flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <p>
              {lista.itens.length < lista.total
                ? `Mostrando ${lista.itens.length} de ${lista.total}`
                : `${lista.total} ${lista.total === 1 ? 'ocorrência' : 'ocorrências'}`}
            </p>
            {lista.itens.length < lista.total && (
              <button
                type="button"
                onClick={carregarMais}
                disabled={carregandoMais}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 font-semibold text-foreground hover:bg-muted disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {carregandoMais && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                Carregar mais
              </button>
            )}
          </div>
        </div>
      )}
    </Pagina>
  );
}

function ListaVazia({
  aba,
  temFiltro,
  aoLimpar,
  aoVerTodas,
}: {
  aba: Aba;
  temFiltro: boolean;
  aoLimpar: () => void;
  aoVerTodas: () => void;
}) {
  const botao =
    'h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-[#0a5242]';

  if (temFiltro) {
    return (
      <EstadoVazio icone={SearchX} titulo="Nenhuma ocorrência com esses filtros">
        <button type="button" onClick={aoLimpar} className={botao}>
          Limpar filtros
        </button>
      </EstadoVazio>
    );
  }
  if (aba === 'PENDENTE') {
    return (
      <EstadoVazio
        icone={CheckCircle2}
        titulo="Nada pendente"
        descricao="Todas as ocorrências que chegaram já estão sendo tratadas ou foram resolvidas."
      >
        <button type="button" onClick={aoVerTodas} className={botao}>
          Ver todas
        </button>
      </EstadoVazio>
    );
  }
  return (
    <EstadoVazio
      icone={SearchX}
      titulo={aba === 'todas' ? 'Nenhuma ocorrência ainda' : 'Nenhuma ocorrência nesta situação'}
      descricao={
        aba === 'todas' ? 'Quando um cliente avaliar pelo QR Code da mesa, ela aparece aqui.' : undefined
      }
    />
  );
}
