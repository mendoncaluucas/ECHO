import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Loader2, Search, SearchX, X } from 'lucide-react';
import {
  listarCategorias,
  listarOcorrencias,
  MAXIMO_POR_PAGINA,
  tokenDaSessao,
  type Categoria,
  type FiltrosDeOcorrencia,
  type Ocorrencia,
  type StatusOcorrencia,
  type TipoFeedback,
} from '../../services/api';
import { baixarCsv, montarCsv } from '../../services/csv';
import {
  corDoTipo,
  ROTULO_STATUS,
  ROTULO_TIPO,
  rotuloDoStatus,
  rotuloDoTipo,
  seloDoStatus,
} from '../../rotulos';
import { AvisoDeErro, CabecalhoDaPagina, Cartao, Esqueleto, EstadoVazio, Pagina } from '../layout/Pagina';
import { ItemDaOcorrencia } from '../coordinator/ItemDaOcorrencia';

const POR_PAGINA = 20;
const PAGINA_MAXIMA = 10_000;

const TIPOS = Object.keys(ROTULO_TIPO) as TipoFeedback[];
const SITUACOES = Object.keys(ROTULO_STATUS) as StatusOcorrencia[];

// Os filtros que vivem no endereço. "pagina" também: voltar de uma ocorrência devolve
// a mesma página, e o link pode ser mandado para outra pessoa.
const CHAVES = ['busca', 'tipo', 'status', 'categoria', 'de', 'ate'] as const;
type Chave = (typeof CHAVES)[number];

const DATA = /^\d{4}-\d{2}-\d{2}$/;

const campo =
  'h-10 w-full min-w-0 rounded-lg border border-border bg-input-background px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const botaoSecundario =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function dataEHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function csvDasOcorrencias(ocorrencias: Ocorrencia[]) {
  const cabecalho = ['ID', 'Data', 'Tipo', 'Status', 'Setor', 'Categorias', 'Comentario', 'Tratado por'];
  const linhas = ocorrencias.map((o) => [
    o.id,
    new Date(o.criadoEm).toLocaleString('pt-BR'),
    rotuloDoTipo(o.tipo),
    rotuloDoStatus(o.status),
    o.area?.nome ?? '',
    o.avaliacoes.map((a) => `${a.categoria}: ${a.estrelas}`).join(' | '),
    o.comentario ?? '',
    o.tratadoPor?.nome ?? '',
  ]);
  return montarCsv([cabecalho, ...linhas]);
}

type Resultado = { itens: Ocorrencia[]; total: number; paginas: number };

export function IssueRegistry() {
  const navigate = useNavigate();
  const token = tokenDaSessao() ?? '';
  const [parametros, setParametros] = useSearchParams();

  // Só passa adiante o que é válido: um endereço editado à mão não pode virar erro 400.
  const ler = (chave: Chave) => parametros.get(chave)?.trim() ?? '';
  const tipo = TIPOS.includes(ler('tipo') as TipoFeedback) ? (ler('tipo') as TipoFeedback) : '';
  const status = SITUACOES.includes(ler('status') as StatusOcorrencia)
    ? (ler('status') as StatusOcorrencia)
    : '';
  const de = DATA.test(ler('de')) ? ler('de') : '';
  const ate = DATA.test(ler('ate')) ? ler('ate') : '';
  const categoria = ler('categoria');
  const buscaAplicada = ler('busca');
  // Teto folgado: um "?pagina=1e20" digitado à mão vai para a última página (efeito
  // abaixo) em vez de virar erro da API.
  const pagina = Math.min(PAGINA_MAXIMA, Math.max(1, Math.floor(Number(parametros.get('pagina'))) || 1));
  const periodoInvalido = de !== '' && ate !== '' && de > ate;
  // O que está no campo de busca; só vira filtro com Enter ou ao sair do campo.
  const [textoDaBusca, setTextoDaBusca] = useState(buscaAplicada);
  // A tela não é recriada quando o endereço muda na mesma rota (o "Registro" do menu
  // limpa os filtros): sem isto, o campo seguia mostrando uma busca que já não valia.
  useEffect(() => setTextoDaBusca(buscaAplicada), [buscaAplicada]);

  const filtros: FiltrosDeOcorrencia = {
    ...(buscaAplicada && { busca: buscaAplicada }),
    ...(tipo && { tipo }),
    ...(status && { status }),
    ...(categoria && { categoria }),
    ...(de && { de }),
    ...(ate && { ate }),
  };
  // Serializado para o efeito reagir a mudança de conteúdo, não de identidade do objeto.
  const chaveDosFiltros = JSON.stringify(filtros);
  const temFiltro = chaveDosFiltros !== '{}';

  // Trocar filtro volta para a primeira página: continuar na página 5 de um resultado
  // que agora tem 2 mostraria uma tela vazia sem explicação.
  const mudarFiltro = (chave: Chave, valor: string) => {
    const novos = new URLSearchParams(parametros);
    if (valor.trim()) novos.set(chave, valor.trim());
    else novos.delete(chave);
    novos.delete('pagina');
    setParametros(novos, { replace: true });
  };
  const irParaPagina = (nova: number) => {
    const novos = new URLSearchParams(parametros);
    if (nova > 1) novos.set('pagina', String(nova));
    else novos.delete('pagina');
    setParametros(novos, { replace: true });
  };
  const limparFiltros = () => {
    setTextoDaBusca('');
    setParametros({}, { replace: true });
  };

  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [buscando, setBuscando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [tentativa, setTentativa] = useState(0);
  const pedidoAtual = useRef(0);

  // Sessão vencida (401) é tratada no serviço da API, que leva ao login.
  useEffect(() => {
    if (periodoInvalido) return;
    const meu = ++pedidoAtual.current;
    setBuscando(true);
    setErro(null);

    listarOcorrencias(token, { ...JSON.parse(chaveDosFiltros), pagina, porPagina: POR_PAGINA })
      .then((res) => {
        if (meu === pedidoAtual.current) setResultado({ itens: res.itens, total: res.total, paginas: res.paginas });
      })
      .catch((e: Error) => {
        if (meu === pedidoAtual.current) setErro(e.message || 'Não foi possível carregar o registro.');
      })
      .finally(() => {
        if (meu === pedidoAtual.current) setBuscando(false);
      });
  }, [token, chaveDosFiltros, pagina, periodoInvalido, tentativa]);

  useEffect(() => {
    listarCategorias(token)
      .then((res) => setCategorias(res.itens))
      .catch(() => {
        // Sem a lista, o filtro de categoria some; o resto funciona.
      });
  }, [token]);

  // Página além do fim (filtro mudou em outra aba, item apagado): vai para a última.
  useEffect(() => {
    if (resultado && resultado.total > 0 && pagina > resultado.paginas) irParaPagina(resultado.paginas);
    // irParaPagina deriva de parametros, que muda junto com pagina.
  }, [resultado, pagina]);

  const exportar = async () => {
    setErro(null);
    setExportando(true);
    try {
      // Leva o resultado inteiro do filtro, não só a página na tela: busca de novo, em
      // blocos do tamanho máximo que a API aceita.
      const todas: Ocorrencia[] = [];
      let paginaAtual = 1;
      let totalDePaginas = 1;
      do {
        const res = await listarOcorrencias(token, {
          ...filtros,
          pagina: paginaAtual,
          porPagina: MAXIMO_POR_PAGINA,
        });
        todas.push(...res.itens);
        totalDePaginas = res.paginas;
        paginaAtual++;
      } while (paginaAtual <= totalDePaginas);

      const hoje = new Date().toISOString().slice(0, 10);
      baixarCsv(`ocorrencias-${hoje}.csv`, csvDasOcorrencias(todas));
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : 'Não foi possível exportar.');
    } finally {
      setExportando(false);
    }
  };

  const total = resultado?.total ?? 0;
  const primeiro = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
  const ultimo = Math.min(pagina * POR_PAGINA, total);

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo="Registro"
        descricao="Todas as ocorrências, com busca, filtros e exportação."
        acoes={
          <button
            type="button"
            onClick={exportar}
            disabled={exportando || total === 0 || periodoInvalido}
            className={botaoSecundario}
          >
            {exportando ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="size-4" aria-hidden="true" />
            )}
            Exportar CSV
          </button>
        }
      />

      <Cartao className="mb-4">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            mudarFiltro('busca', textoDaBusca);
          }}
          className="relative"
        >
          <label htmlFor="busca-registro" className="sr-only">
            Buscar no comentário ou na área
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="busca-registro"
            type="search"
            value={textoDaBusca}
            onChange={(e) => setTextoDaBusca(e.target.value)}
            onBlur={() => textoDaBusca.trim() !== buscaAplicada && mudarFiltro('busca', textoDaBusca)}
            placeholder="Buscar no comentário ou na área e apertar Enter"
            className="h-11 w-full rounded-xl border border-border bg-input-background pr-10 pl-10 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-search-cancel-button]:hidden"
          />
          {textoDaBusca && (
            <button
              type="button"
              onClick={() => {
                setTextoDaBusca('');
                mudarFiltro('busca', '');
              }}
              aria-label="Limpar a busca"
              className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </form>

        {/* Cinco lado a lado só em tela larga: antes disso a data ficava "dd/mm/aa". */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-bold text-muted-foreground">Tipo</span>
            <select value={tipo} onChange={(e) => mudarFiltro('tipo', e.target.value)} className={campo}>
              <option value="">Todos</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-bold text-muted-foreground">Situação</span>
            <select value={status} onChange={(e) => mudarFiltro('status', e.target.value)} className={campo}>
              <option value="">Todas</option>
              {SITUACOES.map((s) => (
                <option key={s} value={s}>
                  {ROTULO_STATUS[s]}
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
                className={campo}
              >
                <option value="">Todas</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.nome}>
                    {c.nome}
                  </option>
                ))}
                {/* Categoria do endereço que não está na lista (link antigo): aparece,
                    senão o filtro valeria com o campo mostrando "Todas". */}
                {categoria && !categorias.some((c) => c.nome === categoria) && (
                  <option value={categoria}>{categoria}</option>
                )}
              </select>
            </label>
          )}
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-bold text-muted-foreground">De</span>
            <input type="date" value={de} max={ate || undefined} onChange={(e) => mudarFiltro('de', e.target.value)} className={campo} />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-bold text-muted-foreground">Até</span>
            <input type="date" value={ate} min={de || undefined} onChange={(e) => mudarFiltro('ate', e.target.value)} className={campo} />
          </label>
        </div>

        {(temFiltro || periodoInvalido) && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {periodoInvalido ? (
              <p role="alert" className="text-sm font-semibold text-perigo">
                A data inicial precisa ser anterior à final.
              </p>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={limparFiltros}
              className="rounded-md px-1 text-sm font-bold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </Cartao>

      {periodoInvalido ? null : erro ? (
        <AvisoDeErro mensagem={erro} aoTentarDeNovo={() => setTentativa((t) => t + 1)} />
      ) : !resultado ? (
        <Cartao>
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando o registro">
            {[0, 1, 2, 3, 4].map((i) => (
              <Esqueleto key={i} className="h-12" />
            ))}
          </div>
        </Cartao>
      ) : resultado.itens.length === 0 ? (
        temFiltro ? (
          <EstadoVazio icone={SearchX} titulo="Nenhuma ocorrência com esses filtros">
            <button type="button" onClick={limparFiltros} className={botaoSecundario}>
              Limpar filtros
            </button>
          </EstadoVazio>
        ) : (
          <EstadoVazio
            icone={SearchX}
            titulo="Nenhuma ocorrência registrada ainda"
            descricao="Quando um cliente avaliar pelo QR Code da mesa, ela aparece aqui."
          />
        )
      ) : (
        <div aria-busy={buscando} className={`transition-opacity ${buscando ? 'opacity-60' : ''}`}>
          {/* Celular: a mesma lista da fila de ocorrências. Uma tabela de sete colunas
              não cabe em 375 px sem rolar de lado. */}
          <Cartao className="md:hidden">
            <ul className="-my-1 divide-y divide-[#efefea]">
              {resultado.itens.map((o) => (
                <li key={o.id}>
                  <ItemDaOcorrencia ocorrencia={o} />
                </li>
              ))}
            </ul>
          </Cartao>

          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
            {/* relative: os textos só para leitor de tela (sr-only) são absolutos e, sem
                um ancestral posicionado, escapavam desta caixa e esticavam a página. */}
            <div className="relative overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Ocorrências registradas</caption>
                <thead className="border-b border-border bg-[#fafaf7] text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-3 whitespace-nowrap">Data</th>
                    <th scope="col" className="px-4 py-3">Ocorrência</th>
                    <th scope="col" className="px-4 py-3">Comentário e notas</th>
                    <th scope="col" className="px-4 py-3">Situação</th>
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">Abrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#efefea]">
                  {resultado.itens.map((o) => (
                    <tr
                      key={o.id}
                      // A linha inteira abre a ocorrência com o mouse; pelo teclado, o
                      // link da última coluna. Clique no próprio link não navega duas vezes.
                      onClick={(e) => {
                        if (!(e.target as HTMLElement).closest('a')) navigate(`/coordenador/ocorrencia/${o.id}`);
                      }}
                      className="cursor-pointer transition-colors hover:bg-[#f6f6f2]"
                    >
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                        <time dateTime={o.criadoEm}>
                          {new Date(o.criadoEm).toLocaleDateString('pt-BR')}
                          <span className="block text-xs text-muted-foreground">
                            {new Date(o.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </time>
                      </td>
                      {/* Tipo e área numa coluna, e as notas embaixo do comentário: com uma
                          coluna para cada, a tabela não cabia num notebook com o menu aberto. */}
                      <td className="px-4 py-3">
                        <span className="flex items-start gap-2 font-semibold">
                          <span className={`mt-1.5 size-2.5 flex-none rounded-full ${corDoTipo(o.tipo)}`} aria-hidden="true" />
                          <span>
                            {rotuloDoTipo(o.tipo)}
                            <span className="block text-xs font-medium text-muted-foreground">
                              {o.area?.nome ?? 'Restaurante'}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="min-w-56 px-4 py-3">
                        {o.comentario ? (
                          <span className="line-clamp-2 break-words text-[#3a3f4a]">{o.comentario}</span>
                        ) : (
                          <span className="text-muted-foreground italic">Sem comentário</span>
                        )}
                        {o.avaliacoes.length > 0 && (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {o.avaliacoes.map((a) => `${a.categoria} ${a.estrelas}★`).join(' · ')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ${seloDoStatus(o.status)}`}
                        >
                          {rotuloDoStatus(o.status)}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-right">
                        <Link
                          to={`/coordenador/ocorrencia/${o.id}`}
                          aria-label={`Abrir a ocorrência de ${dataEHora(o.criadoEm)}`}
                          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          <ChevronRight className="size-4" aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <nav aria-label="Páginas" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground tabular-nums">
              {primeiro}–{ultimo} de {total}
            </p>
            {resultado.paginas > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => irParaPagina(pagina - 1)}
                  disabled={pagina <= 1}
                  aria-label="Página anterior"
                  className={`${botaoSecundario} w-10 px-0`}
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </button>
                <span className="px-1 font-semibold tabular-nums">
                  {pagina} de {resultado.paginas}
                </span>
                <button
                  type="button"
                  onClick={() => irParaPagina(pagina + 1)}
                  disabled={pagina >= resultado.paginas}
                  aria-label="Próxima página"
                  className={`${botaoSecundario} w-10 px-0`}
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </nav>
        </div>
      )}
    </Pagina>
  );
}
