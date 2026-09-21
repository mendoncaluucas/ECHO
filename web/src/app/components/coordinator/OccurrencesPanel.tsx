import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Filter, Droplet, Users, UtensilsCrossed, Lightbulb, ThumbsUp, AlertCircle, Loader2 } from 'lucide-react';
import { Navigation } from '../Navigation';
import {
  listarOcorrencias,
  type Ocorrencia,
  type StatusOcorrencia,
  type TipoFeedback,
} from '../../services/api';

// remove acentos e caixa para casar o nome da categoria (vem do banco) com o ícone certo
const normalizar = (texto: string) =>
  texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const categoryIcons: Record<string, typeof Droplet> = {
  higiene: Droplet,
  atendimento: Users,
  alimento: UtensilsCrossed,
};

// As classes precisam aparecer inteiras no código: o Tailwind varre os arquivos
// por strings completas e não gera nada montado em tempo de execução.
const tipoConfig: Record<TipoFeedback, { label: string; classe: string; icon: typeof AlertCircle }> = {
  RECLAMACAO: { label: 'Reclamação', classe: 'bg-red-100 text-red-700', icon: AlertCircle },
  SUGESTAO: { label: 'Sugestão', classe: 'bg-amber-100 text-amber-700', icon: Lightbulb },
  ELOGIO: { label: 'Elogio', classe: 'bg-green-100 text-green-700', icon: ThumbsUp },
};

// Usados quando a API devolver um valor que o front ainda não conhece — evita
// quebrar a tela inteira se o enum do backend crescer antes de um deploy do front.
const TIPO_DESCONHECIDO = { label: 'Outro', classe: 'bg-gray-100 text-gray-700', icon: AlertCircle };
const STATUS_DESCONHECIDO = { label: 'Desconhecido', classe: 'bg-gray-100 text-gray-700' };

const statusConfig: Record<StatusOcorrencia, { label: string; classe: string }> = {
  PENDENTE: { label: 'Pendente', classe: 'bg-gray-100 text-gray-700' },
  EM_ANDAMENTO: { label: 'Em andamento', classe: 'bg-blue-100 text-blue-700' },
  RESOLVIDO: { label: 'Resolvido', classe: 'bg-green-100 text-green-700' },
};

export function OccurrencesPanel() {
  const navigate = useNavigate();
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filterTipo, setFilterTipo] = useState<TipoFeedback | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<StatusOcorrencia | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<string | 'all'>('all');

  useEffect(() => {
    const token = localStorage.getItem('echo_token');
    if (!token) {
      navigate('/coordenador/login');
      return;
    }

    let ativo = true;
    setCarregando(true);
    setErro(null);

    listarOcorrencias(token)
      .then((res) => {
        if (ativo) setOcorrencias(res.itens);
      })
      .catch((e: Error & { status?: number }) => {
        if (!ativo) return;
        if (e.status === 401) {
          // sem token ou token expirado (validade de 8h) — volta pro login
          localStorage.removeItem('echo_token');
          localStorage.removeItem('echo_usuario');
          navigate('/coordenador/login');
          return;
        }
        setErro(e.message || 'Não foi possível carregar as ocorrências.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [navigate]);

  // categorias disponíveis para o filtro, derivadas do que veio da API
  const categoriasDisponiveis = Array.from(
    new Set(
      ocorrencias.flatMap((occ) => occ.avaliacoes.map((a) => a.categoria))
    )
  );

  const filteredOccurrences = ocorrencias.filter((occ) => {
    const passaTipo = filterTipo === 'all' || occ.tipo === filterTipo;
    const passaStatus = filterStatus === 'all' || occ.status === filterStatus;
    const passaCategoria =
      filterCategory === 'all' ||
      occ.avaliacoes.some((a) => a.categoria === filterCategory);
    return passaTipo && passaStatus && passaCategoria;
  });

  return (
    <div className="min-h-screen bg-purple-50">
      <Navigation title="Painel de Ocorrências" role="coordinator" />
      <div className="max-w-4xl mx-auto p-4 pb-8">
        <div className="pt-6 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Painel de Ocorrências</h1>
          <p className="text-gray-600 mt-1">Gerencie feedbacks recebidos</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-5 h-5 text-purple-600" />
            <span className="font-semibold text-gray-900">Filtros</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as StatusOcorrencia | 'all')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">Todos</option>
                <option value="PENDENTE">Pendente</option>
                <option value="EM_ANDAMENTO">Em andamento</option>
                <option value="RESOLVIDO">Resolvido</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo
              </label>
              <select
                value={filterTipo}
                onChange={(e) => setFilterTipo(e.target.value as TipoFeedback | 'all')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">Todos</option>
                <option value="RECLAMACAO">Reclamação</option>
                <option value="SUGESTAO">Sugestão</option>
                <option value="ELOGIO">Elogio</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Categoria
              </label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">Todas</option>
                {categoriasDisponiveis.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {carregando && (
          <div className="flex items-center justify-center gap-2 text-gray-500 py-12">
            <Loader2 className="w-5 h-5 animate-spin" />
            Carregando ocorrências...
          </div>
        )}

        {!carregando && erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-center">
            {erro}
          </div>
        )}

        {!carregando && !erro && filteredOccurrences.length === 0 && (
          <div className="bg-white rounded-xl shadow-md p-8 text-center text-gray-500">
            Nenhuma ocorrência encontrada.
          </div>
        )}

        {!carregando && !erro && filteredOccurrences.length > 0 && (
          <div className="space-y-4">
            {filteredOccurrences.map((occ) => {
              const primeiraCategoria = occ.avaliacoes[0]?.categoria;
              const CategoryIcon = primeiraCategoria
                ? categoryIcons[normalizar(primeiraCategoria)] ?? Filter
                : Filter;
              const tipoInfo = tipoConfig[occ.tipo] ?? TIPO_DESCONHECIDO;
              const statusInfo = statusConfig[occ.status] ?? STATUS_DESCONHECIDO;
              const TipoIcon = tipoInfo.icon;

              return (
                <button
                  key={occ.id}
                  onClick={() => navigate(`/coordenador/ocorrencia/${occ.id}`)}
                  className="w-full text-left bg-white rounded-xl shadow-md p-4 border-l-4 border-purple-600 transition-shadow hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <CategoryIcon className="w-6 h-6 text-purple-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <span className="font-semibold text-gray-900">
                          {occ.anonimo ? 'Anônimo' : 'Identificado'}
                        </span>
                        <span className="flex items-center gap-2 flex-shrink-0">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${statusInfo.classe}`}
                          >
                            {statusInfo.label}
                          </span>
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${tipoInfo.classe} flex items-center gap-1`}
                          >
                            <TipoIcon className="w-3 h-3" />
                            {tipoInfo.label}
                          </span>
                        </span>
                      </div>
                      <p className="text-gray-600 text-sm mb-2">
                        {occ.comentario || 'Sem comentário.'}
                      </p>
                      {occ.avaliacoes.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {occ.avaliacoes.map((a, i) => (
                            <span
                              key={i}
                              className="text-xs bg-purple-50 text-purple-700 rounded-full px-2 py-1"
                            >
                              {a.categoria}: {a.estrelas}★
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{occ.area?.nome ?? 'Área não informada'}</span>
                        <span>•</span>
                        <span>{new Date(occ.criadoEm).toLocaleString('pt-BR')}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
