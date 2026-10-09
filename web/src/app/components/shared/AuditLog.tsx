import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-react';
import {
  listarAuditoria,
  listarUsuarios,
  tokenDaSessao,
  type AcaoAuditoria,
  type FiltrosDeAuditoria,
  type RegistroDeAuditoria,
  type UsuarioGestao,
} from '../../services/api';
import { descrever, ROTULO_ACAO } from '../../descricaoDaAuditoria';
import { AvisoDeErro, CabecalhoDaPagina, Cartao, Esqueleto, EstadoVazio, Pagina } from '../layout/Pagina';

const POR_PAGINA = 20;
const PAGINA_MAXIMA = 10_000;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const ACOES = Object.keys(ROTULO_ACAO) as AcaoAuditoria[];

const CHAVES = ['usuario', 'acao', 'de', 'ate'] as const;
type Chave = (typeof CHAVES)[number];

const campo =
  'h-10 w-full min-w-0 rounded-lg border border-border bg-input-background px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const botaoSecundario =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function dia(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR');
}
function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

type Resultado = { itens: RegistroDeAuditoria[]; total: number; paginas: number };

export function AuditLog() {
  const token = tokenDaSessao() ?? '';
  const [parametros, setParametros] = useSearchParams();

  // Filtros e página no endereço, como no Registro. Só passa adiante o que é válido:
  // um endereço editado à mão não pode virar erro 400.
  const ler = (chave: Chave) => parametros.get(chave)?.trim() ?? '';
  const usuarioId = ler('usuario');
  const acao = ACOES.includes(ler('acao') as AcaoAuditoria) ? (ler('acao') as AcaoAuditoria) : '';
  const de = DATA.test(ler('de')) ? ler('de') : '';
  const ate = DATA.test(ler('ate')) ? ler('ate') : '';
  const pagina = Math.min(PAGINA_MAXIMA, Math.max(1, Math.floor(Number(parametros.get('pagina'))) || 1));
  const periodoInvalido = de !== '' && ate !== '' && de > ate;

  const filtros: FiltrosDeAuditoria = {
    ...(usuarioId && { usuarioId }),
    ...(acao && { acao }),
    ...(de && { de }),
    ...(ate && { ate }),
  };
  const chaveDosFiltros = JSON.stringify(filtros);
  const temFiltro = chaveDosFiltros !== '{}';

  const mudarFiltro = (chave: Chave, valor: string) => {
    const novos = new URLSearchParams(parametros);
    if (valor) novos.set(chave, valor);
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

  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [buscando, setBuscando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioGestao[]>([]);
  const [tentativa, setTentativa] = useState(0);
  const pedidoAtual = useRef(0);

  // Lista de usuários para o filtro. Falhar aqui não impede de ver o log: o filtro
  // só fica com "Todos".
  useEffect(() => {
    listarUsuarios(token)
      .then((res) => setUsuarios([...res.itens].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))))
      .catch(() => {});
  }, [token]);

  // Sessão vencida (401) é tratada no serviço da API, que leva ao login.
  useEffect(() => {
    if (periodoInvalido) return;
    const meu = ++pedidoAtual.current;
    setBuscando(true);
    setErro(null);

    listarAuditoria(token, { ...JSON.parse(chaveDosFiltros), pagina, porPagina: POR_PAGINA })
      .then((res) => {
        if (meu === pedidoAtual.current) setResultado({ itens: res.itens, total: res.total, paginas: res.paginas });
      })
      .catch((e: Error & { status?: number }) => {
        if (meu !== pedidoAtual.current) return;
        setErro(e.status === 403 ? 'Só administradores podem ver o log.' : e.message || 'Não foi possível carregar o log.');
      })
      .finally(() => {
        if (meu === pedidoAtual.current) setBuscando(false);
      });
  }, [token, chaveDosFiltros, pagina, periodoInvalido, tentativa]);

  // Página além do fim (link antigo, "?pagina=1e20"): vai para a última.
  useEffect(() => {
    if (resultado && resultado.total > 0 && pagina > resultado.paginas) irParaPagina(resultado.paginas);
    // irParaPagina deriva de parametros, que muda junto com pagina.
  }, [resultado, pagina]);

  const total = resultado?.total ?? 0;
  const primeiro = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
  const ultimo = Math.min(pagina * POR_PAGINA, total);
  const usuarioDoFiltroForaDaLista = usuarioId !== '' && usuarios.length > 0 && !usuarios.some((u) => u.id === usuarioId);

  return (
    <Pagina>
      <CabecalhoDaPagina titulo="Log de atividades" descricao="Quem fez o quê no Echo, e quando." />

      <Cartao className="mb-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-bold text-muted-foreground">Quem</span>
            <select value={usuarioId} onChange={(e) => mudarFiltro('usuario', e.target.value)} className={campo}>
              <option value="">Todos</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                  {u.ativo ? '' : ' (desativado)'}
                </option>
              ))}
              {/* Usuário do endereço que não está na lista: aparece, senão o filtro
                  valeria com o campo mostrando "Todos". */}
              {usuarioDoFiltroForaDaLista && <option value={usuarioId}>Usuário não encontrado</option>}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-bold text-muted-foreground">O quê</span>
            <select value={acao} onChange={(e) => mudarFiltro('acao', e.target.value)} className={campo}>
              <option value="">Todas as ações</option>
              {ACOES.map((a) => (
                <option key={a} value={a}>
                  {ROTULO_ACAO[a]}
                </option>
              ))}
            </select>
          </label>
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
              onClick={() => setParametros({}, { replace: true })}
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
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando o log">
            {[0, 1, 2, 3, 4].map((i) => (
              <Esqueleto key={i} className="h-12" />
            ))}
          </div>
        </Cartao>
      ) : resultado.itens.length === 0 ? (
        <EstadoVazio
          icone={ScrollText}
          titulo={temFiltro ? 'Nenhum registro com esses filtros' : 'Nenhuma atividade registrada ainda'}
        >
          {temFiltro && (
            <button type="button" onClick={() => setParametros({}, { replace: true })} className={botaoSecundario}>
              Limpar filtros
            </button>
          )}
        </EstadoVazio>
      ) : (
        <div aria-busy={buscando} className={`transition-opacity ${buscando ? 'opacity-60' : ''}`}>
          {/* Celular: lista. Quatro colunas com a descrição não cabem em 375 px. */}
          <Cartao className="md:hidden">
            <ul className="-my-1 divide-y divide-[#efefea]">
              {resultado.itens.map((r) => (
                <li key={r.id} className="py-3">
                  <p className="text-xs font-bold text-muted-foreground">{ROTULO_ACAO[r.acao] ?? r.acao}</p>
                  <p className="mt-0.5 text-sm font-semibold break-words">{descrever(r)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.usuario.nome} · <time dateTime={r.criadoEm}>{dia(r.criadoEm)} {hora(r.criadoEm)}</time>
                    {r.entidade === 'Feedback' && (
                      <>
                        {' · '}
                        <LinkDaOcorrencia id={r.entidadeId} />
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </Cartao>

          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
            {/* relative: os textos só para leitor de tela (sr-only) são absolutos e, sem
                um ancestral posicionado, escapavam desta caixa e esticavam a página. */}
            <div className="relative overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Atividades registradas</caption>
                <thead className="border-b border-border bg-[#fafaf7] text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-3">Quando</th>
                    <th scope="col" className="px-4 py-3">Quem</th>
                    <th scope="col" className="px-4 py-3">O que fez</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#efefea]">
                  {resultado.itens.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                        <time dateTime={r.criadoEm}>
                          {dia(r.criadoEm)}
                          <span className="block text-xs text-muted-foreground">{hora(r.criadoEm)}</span>
                        </time>
                      </td>
                      <td className="px-4 py-3 font-semibold">{r.usuario.nome}</td>
                      <td className="min-w-64 px-4 py-3">
                        <span className="block text-xs font-bold text-muted-foreground">
                          {ROTULO_ACAO[r.acao] ?? r.acao}
                        </span>
                        <span className="break-words">{descrever(r)}</span>
                        {r.entidade === 'Feedback' && (
                          <span className="mt-1 block">
                            <LinkDaOcorrencia id={r.entidadeId} />
                          </span>
                        )}
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

function LinkDaOcorrencia({ id }: { id: string }) {
  return (
    <Link
      to={`/coordenador/ocorrencia/${id}`}
      className="inline-flex items-center gap-0.5 rounded-md text-xs font-bold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      Ver a ocorrência
      <ChevronRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}
