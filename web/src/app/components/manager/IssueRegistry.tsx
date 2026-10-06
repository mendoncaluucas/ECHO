import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Download, Eye, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Navigation } from '../Navigation';
import {
  encerrarSessao,
  listarOcorrencias,
  MAXIMO_POR_PAGINA,
  type FiltrosDeOcorrencia,
  type Ocorrencia,
  type StatusOcorrencia,
  type TipoFeedback,
} from '../../services/api';
import { baixarCsv, montarCsv } from '../../services/csv';

const POR_PAGINA = 20;

// Classes inteiras: o Tailwind varre o código por strings completas.
const CONFIG_STATUS: Record<StatusOcorrencia, { rotulo: string; classe: string }> = {
  PENDENTE: { rotulo: 'Pendente', classe: 'bg-red-100 text-red-700' },
  EM_ANDAMENTO: { rotulo: 'Em andamento', classe: 'bg-amber-100 text-amber-700' },
  RESOLVIDO: { rotulo: 'Resolvido', classe: 'bg-green-100 text-green-700' },
};

const ROTULO_TIPO: Record<TipoFeedback, string> = {
  ELOGIO: 'Elogio',
  SUGESTAO: 'Sugestão',
  RECLAMACAO: 'Reclamação',
};

const STATUS_DESCONHECIDO = { rotulo: 'Desconhecido', classe: 'bg-gray-100 text-gray-700' };

const CATEGORIAS = ['Higiene', 'Atendimento', 'Alimento'];

const campo =
  'px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500';

function csvDasOcorrencias(ocorrencias: Ocorrencia[]) {
  const cabecalho = [
    'ID',
    'Data',
    'Tipo',
    'Status',
    'Setor',
    'Categorias',
    'Comentario',
    'Tratado por',
  ];

  const linhas = ocorrencias.map((o) =>
    [
      o.id,
      new Date(o.criadoEm).toLocaleString('pt-BR'),
      ROTULO_TIPO[o.tipo] ?? o.tipo,
      (CONFIG_STATUS[o.status] ?? STATUS_DESCONHECIDO).rotulo,
      o.area?.nome ?? '',
      o.avaliacoes.map((a) => `${a.categoria}: ${a.estrelas}`).join(' | '),
      o.comentario ?? '',
      o.tratadoPor?.nome ?? '',
    ]
  );

  return montarCsv([cabecalho, ...linhas]);
}

export function IssueRegistry() {
  const navigate = useNavigate();
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [total, setTotal] = useState(0);
  const [paginas, setPaginas] = useState(1);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [categoria, setCategoria] = useState('');
  const [status, setStatus] = useState<StatusOcorrencia | ''>('');
  const [de, setDe] = useState('');

  const requisicaoAtual = useRef(0);

  const filtros: FiltrosDeOcorrencia = {
    ...(status && { status }),
    ...(categoria && { categoria }),
    ...(buscaAplicada && { busca: buscaAplicada }),
    ...(de && { de }),
  };
  // Serializado para o efeito reagir a mudança de conteúdo, não de identidade do objeto.
  const chaveDosFiltros = JSON.stringify(filtros);

  const tratarFalha = (e: Error & { status?: number }) => {
    if (e.status === 401) {
      encerrarSessao();
      navigate('/gerente/login');
      return true;
    }
    setErro(e.message || 'Não foi possível carregar as ocorrências.');
    return false;
  };

  const carregar = useCallback(() => {
    const token = localStorage.getItem('echo_token');
    if (!token) {
      navigate('/gerente/login');
      return;
    }

    const minhaVez = ++requisicaoAtual.current;
    setErro(null);

    listarOcorrencias(token, { ...JSON.parse(chaveDosFiltros), pagina, porPagina: POR_PAGINA })
      .then((res) => {
        if (minhaVez !== requisicaoAtual.current) return;
        setOcorrencias(res.itens);
        setTotal(res.total);
        setPaginas(res.paginas);
      })
      .catch((e: Error & { status?: number }) => {
        if (minhaVez !== requisicaoAtual.current) return;
        tratarFalha(e);
      })
      .finally(() => {
        if (minhaVez === requisicaoAtual.current) setCarregando(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDosFiltros, pagina, navigate]);

  useEffect(() => {
    carregar();
    return () => {
      requisicaoAtual.current++;
    };
  }, [carregar]);

  // Trocar filtro tem que voltar para a primeira página: continuar na página 5 de um
  // resultado que agora tem 2 mostraria uma tela vazia sem explicação.
  const aplicarFiltro = (aplicar: () => void) => {
    aplicar();
    setPagina(1);
  };

  const exportar = async () => {
    const token = localStorage.getItem('echo_token');
    if (!token) return;
    setErro(null);
    setExportando(true);

    try {
      // A exportação leva o resultado inteiro do filtro, não só a página na tela —
      // por isso busca de novo, em blocos do tamanho máximo que a API aceita.
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
      tratarFalha(e as Error & { status?: number });
    } finally {
      setExportando(false);
    }
  };

  const primeiroDaPagina = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
  const ultimoDaPagina = Math.min(pagina * POR_PAGINA, total);

  return (
    <div className="min-h-screen bg-orange-50">
      <Navigation title="Registro de Ocorrências" role="manager" />
      <div className="max-w-6xl mx-auto p-4 pb-8">
        <div className="pt-6 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Registro de Ocorrências</h1>
          <p className="text-gray-600 mt-1">Histórico completo de feedbacks</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  aplicarFiltro(() => setBuscaAplicada(busca));
                }}
                className="relative"
              >
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por comentário ou setor e pressionar Enter..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onBlur={() => aplicarFiltro(() => setBuscaAplicada(busca))}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </form>
            </div>
            <button
              onClick={exportar}
              disabled={exportando || total === 0}
              className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {exportando ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Download className="w-5 h-5" />
              )}
              Exportar CSV
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <select
              value={categoria}
              onChange={(e) => aplicarFiltro(() => setCategoria(e.target.value))}
              className={campo}
            >
              <option value="">Todas as Categorias</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={status}
              onChange={(e) =>
                aplicarFiltro(() => setStatus(e.target.value as StatusOcorrencia | ''))
              }
              className={campo}
            >
              <option value="">Todos os Status</option>
              {(Object.keys(CONFIG_STATUS) as StatusOcorrencia[]).map((s) => (
                <option key={s} value={s}>
                  {CONFIG_STATUS[s].rotulo}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={de}
              onChange={(e) => aplicarFiltro(() => setDe(e.target.value))}
              title="Mostrar a partir desta data"
              className={campo}
            />
          </div>
        </div>

        {erro && (
          <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {erro}
          </p>
        )}

        {carregando ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-orange-100">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Data</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Tipo</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Setor</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Categorias</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Comentário</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {ocorrencias.map((occ) => {
                    const info = CONFIG_STATUS[occ.status] ?? STATUS_DESCONHECIDO;

                    return (
                      <tr key={occ.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                          {new Date(occ.criadoEm).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {ROTULO_TIPO[occ.tipo] ?? occ.tipo}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {occ.area?.nome ?? '—'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {occ.avaliacoes.length > 0
                            ? occ.avaliacoes.map((a) => `${a.categoria} ${a.estrelas}★`).join(', ')
                            : '—'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                          {occ.comentario || '—'}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${info.classe}`}
                          >
                            {info.rotulo}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => navigate(`/coordenador/ocorrencia/${occ.id}`)}
                            className="text-orange-600 hover:text-orange-700 font-semibold flex items-center gap-1"
                          >
                            <Eye className="w-4 h-4" />
                            Ver
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {ocorrencias.length === 0 && (
              <p className="px-6 py-10 text-center text-gray-600">
                {total === 0 && !status && !categoria && !buscaAplicada && !de
                  ? 'Nenhuma ocorrência registrada ainda.'
                  : 'Nenhuma ocorrência encontrada para estes filtros.'}
              </p>
            )}

            {total > 0 && (
              <div className="flex items-center justify-between gap-4 px-6 py-4 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  {primeiroDaPagina}–{ultimoDaPagina} de {total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    disabled={pagina <= 1}
                    className="p-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-600">
                    {pagina} de {paginas}
                  </span>
                  <button
                    onClick={() => setPagina((p) => Math.min(paginas, p + 1))}
                    disabled={pagina >= paginas}
                    className="p-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Próxima página"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
