import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Filter, Loader2, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import {
  encerrarSessao,
  listarAuditoria,
  listarUsuarios,
  tokenDaSessao,
  usuarioLogado,
  type AcaoAuditoria,
  type FiltrosDeAuditoria,
  type RegistroDeAuditoria,
  type UsuarioGestao,
} from '../../services/api';
import { descrever, ROTULO_ACAO } from '../../descricaoDaAuditoria';

const POR_PAGINA = 20;

const ROTULO_ENTIDADE: Record<string, string> = {
  User: 'Usuário',
  Area: 'Área',
  QRCode: 'QR Code',
  Feedback: 'Ocorrência',
  Configuracao: 'Configuração',
};

const campo =
  'px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-700';

export function AuditLog() {
  const navigate = useNavigate();
  const [registros, setRegistros] = useState<RegistroDeAuditoria[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioGestao[]>([]);
  const [total, setTotal] = useState(0);
  const [paginas, setPaginas] = useState(1);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);

  const [usuarioId, setUsuarioId] = useState('');
  const [acao, setAcao] = useState<AcaoAuditoria | ''>('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');

  const token = tokenDaSessao();
  const requisicaoAtual = useRef(0);

  // O log é do administrador. Checar aqui evita mostrar a tela e só então o 403;
  // o backend continua sendo a autoridade.
  const naoEAdministrador = usuarioLogado()?.papel !== 'ADMINISTRADOR';

  const filtros: FiltrosDeAuditoria = {
    ...(usuarioId && { usuarioId }),
    ...(acao && { acao }),
    ...(de && { de }),
    ...(ate && { ate }),
  };
  const chaveDosFiltros = JSON.stringify(filtros);
  const temFiltro = chaveDosFiltros !== '{}';

  const tratarFalha = useCallback(
    (e: Error & { status?: number }) => {
      if (e.status === 401) {
        encerrarSessao();
        navigate('/gerente/login');
        return;
      }
      if (e.status === 403) {
        setSemPermissao(true);
        return;
      }
      setErro(e.message || 'Não foi possível carregar o log de atividades.');
    },
    [navigate]
  );

  // Lista de usuários para o filtro. Falhar aqui não impede de ver o log —
  // o filtro só fica com "Todos".
  useEffect(() => {
    if (!token || naoEAdministrador) return;
    let ativo = true;
    listarUsuarios(token)
      .then((res) => {
        if (ativo) setUsuarios(res.itens);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [token, naoEAdministrador]);

  useEffect(() => {
    if (!token) {
      navigate('/gerente/login');
      return;
    }
    if (naoEAdministrador) return;

    const minhaVez = ++requisicaoAtual.current;
    setErro(null);

    listarAuditoria(token, { ...JSON.parse(chaveDosFiltros), pagina, porPagina: POR_PAGINA })
      .then((res) => {
        if (minhaVez !== requisicaoAtual.current) return;
        setRegistros(res.itens);
        setTotal(res.total);
        setPaginas(res.paginas);
      })
      .catch((e: Error & { status?: number }) => {
        if (minhaVez === requisicaoAtual.current) tratarFalha(e);
      })
      .finally(() => {
        if (minhaVez === requisicaoAtual.current) setCarregando(false);
      });

    return () => {
      requisicaoAtual.current++;
    };
  }, [token, naoEAdministrador, chaveDosFiltros, pagina, navigate, tratarFalha]);

  // Trocar filtro volta para a primeira página, senão a página 5 de um resultado
  // que agora tem 2 apareceria vazia sem explicação.
  const aplicarFiltro = (aplicar: () => void) => {
    aplicar();
    setPagina(1);
  };

  const primeiroDaPagina = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
  const ultimoDaPagina = Math.min(pagina * POR_PAGINA, total);

  const moldura = (conteudo: React.ReactNode) => (
    <div>
      <div className="max-w-6xl mx-auto p-4 pb-8">
        <div className="pt-6 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Log de Atividades</h1>
          <p className="text-gray-600 mt-1">Quem fez o quê no sistema, e quando</p>
        </div>
        {conteudo}
      </div>
    </div>
  );

  if (semPermissao || naoEAdministrador) {
    return moldura(
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center space-y-2">
        <h2 className="text-lg font-bold text-gray-900">Acesso restrito</h2>
        <p className="text-gray-600">Apenas administradores podem consultar o log de atividades.</p>
      </div>
    );
  }

  return moldura(
    <>
      <div className="bg-white rounded-2xl shadow-lg p-4 mb-6">
        <div className="flex items-center gap-2 mb-3 text-gray-700">
          <Filter className="w-5 h-5" />
          <span className="text-sm font-semibold">Filtros</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={usuarioId}
            onChange={(e) => aplicarFiltro(() => setUsuarioId(e.target.value))}
            className={campo}
          >
            <option value="">Todos os usuários</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
                {u.ativo ? '' : ' (inativo)'}
              </option>
            ))}
          </select>

          <select
            value={acao}
            onChange={(e) => aplicarFiltro(() => setAcao(e.target.value as AcaoAuditoria | ''))}
            className={campo}
          >
            <option value="">Todas as ações</option>
            {(Object.keys(ROTULO_ACAO) as AcaoAuditoria[]).map((a) => (
              <option key={a} value={a}>
                {ROTULO_ACAO[a]}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={de}
            onChange={(e) => aplicarFiltro(() => setDe(e.target.value))}
            title="A partir desta data"
            className={campo}
          />
          <input
            type="date"
            value={ate}
            onChange={(e) => aplicarFiltro(() => setAte(e.target.value))}
            title="Até esta data (inclusive)"
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
          <Loader2 className="w-8 h-8 animate-spin text-slate-700" />
        </div>
      ) : registros.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">
            {temFiltro
              ? 'Nenhum registro encontrado para estes filtros.'
              : 'Nenhuma atividade registrada ainda.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                    Data/Hora
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                    Usuário
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                    Ação Realizada
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                    Registro
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {registros.map((registro) => (
                  <tr key={registro.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900 font-mono whitespace-nowrap">
                      {new Date(registro.criadoEm).toLocaleString('pt-BR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {registro.usuario.nome}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <span className="block text-xs font-semibold text-gray-500 mb-0.5">
                        {ROTULO_ACAO[registro.acao] ?? registro.acao}
                      </span>
                      {descrever(registro)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                      {registro.entidade === 'Feedback' ? (
                        <button
                          onClick={() => navigate(`/coordenador/ocorrencia/${registro.entidadeId}`)}
                          className="text-slate-700 hover:text-slate-900 font-semibold flex items-center gap-1"
                        >
                          <Eye className="w-4 h-4" />
                          Ver ocorrência
                        </button>
                      ) : (
                        <span title={registro.entidadeId}>
                          {ROTULO_ENTIDADE[registro.entidade] ?? registro.entidade}{' '}
                          <span className="font-mono text-xs text-gray-400">
                            {registro.entidadeId.slice(0, 8)}
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
        </div>
      )}
    </>
  );
}
