import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Star, Loader2, UserCheck } from 'lucide-react';
import {
  atualizarStatusOcorrencia,
  buscarOcorrencia,
  type Ocorrencia,
  type StatusOcorrencia,
} from '../../services/api';

const tipoLabel: Record<string, { texto: string; classe: string }> = {
  RECLAMACAO: { texto: 'Reclamação', classe: 'bg-red-100 text-red-700' },
  SUGESTAO: { texto: 'Sugestão', classe: 'bg-amber-100 text-amber-700' },
  ELOGIO: { texto: 'Elogio', classe: 'bg-green-100 text-green-700' },
};

const statusLabel: Record<StatusOcorrencia, string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  RESOLVIDO: 'Resolvido',
};

export function OccurrenceDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [ocorrencia, setOcorrencia] = useState<Ocorrencia | null>(null);
  const [status, setStatus] = useState<StatusOcorrencia>('PENDENTE');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const token = localStorage.getItem('echo_token');

  useEffect(() => {
    if (!token || !id) {
      navigate('/coordenador/login');
      return;
    }

    let ativo = true;

    buscarOcorrencia(id, token)
      .then((res) => {
        if (!ativo) return;
        setOcorrencia(res);
        setStatus(res.status);
      })
      .catch((e: Error & { status?: number }) => {
        if (!ativo) return;
        if (e.status === 401) {
          localStorage.removeItem('echo_token');
          navigate('/coordenador/login');
          return;
        }
        setErro(e.message || 'Não foi possível carregar a ocorrência.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [id, token, navigate]);

  const handleSalvar = async () => {
    if (!id || !token) return;
    setErro(null);
    setSalvando(true);
    try {
      await atualizarStatusOcorrencia(id, status, token);
      navigate('/coordenador/ocorrencias');
    } catch (e) {
      const status401 = (e as { status?: number }).status === 401;
      if (status401) {
        localStorage.removeItem('echo_token');
        navigate('/coordenador/login');
        return;
      }
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const voltar = (
    <button
      onClick={() => navigate('/coordenador/ocorrencias')}
      className="flex items-center gap-2 text-purple-600 hover:text-purple-700 mb-6 mt-4 font-semibold"
    >
      <ArrowLeft className="w-5 h-5" />
      Voltar
    </button>
  );

  if (carregando) {
    return (
      <div className="min-h-screen bg-purple-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!ocorrencia) {
    return (
      <div className="min-h-screen bg-purple-50 p-4">
        <div className="max-w-3xl mx-auto">
          {voltar}
          <p className="bg-white rounded-2xl shadow-lg p-6 text-gray-700">
            {erro ?? 'Ocorrência não encontrada.'}
          </p>
        </div>
      </div>
    );
  }

  const tipo = tipoLabel[ocorrencia.tipo] ?? {
    texto: ocorrencia.tipo,
    classe: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="min-h-screen bg-purple-50 p-4 pb-8">
      <div className="max-w-3xl mx-auto">
        {voltar}

        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
          <div className="border-b border-gray-200 pb-4">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl font-bold text-gray-900">Ocorrência</h1>
              <span
                className={`px-3 py-1 rounded-full text-sm font-semibold ${tipo.classe}`}
              >
                {tipo.texto}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span>{ocorrencia.anonimo ? 'Anônimo' : 'Identificado'}</span>
              {ocorrencia.area && (
                <>
                  <span>•</span>
                  <span>{ocorrencia.area.nome}</span>
                </>
              )}
              <span>•</span>
              <span>{new Date(ocorrencia.criadoEm).toLocaleString('pt-BR')}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Avaliação por categoria
            </label>
            <div className="space-y-2">
              {ocorrencia.avaliacoes.map((avaliacao) => (
                <div key={avaliacao.categoria} className="flex items-center gap-3">
                  <span className="w-32 text-gray-700">{avaliacao.categoria}</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((estrela) => (
                      <Star
                        key={estrela}
                        className={`w-5 h-5 ${
                          estrela <= avaliacao.estrelas
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Comentário do Cliente
            </label>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-gray-700 leading-relaxed">
                {ocorrencia.comentario || 'Sem comentário.'}
              </p>
            </div>
          </div>

          {ocorrencia.tratadoPor && (
            <div className="bg-purple-50 rounded-xl p-4 flex items-center gap-2 text-sm text-purple-900">
              <UserCheck className="w-4 h-4 text-purple-600" />
              <span>
                Tratado por <strong>{ocorrencia.tratadoPor.nome}</strong>
                {ocorrencia.tratadoEm &&
                  ` em ${new Date(ocorrencia.tratadoEm).toLocaleString('pt-BR')}`}
              </span>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusOcorrencia)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {(Object.keys(statusLabel) as StatusOcorrencia[]).map((valor) => (
                <option key={valor} value={valor}>
                  {statusLabel[valor]}
                </option>
              ))}
            </select>
          </div>

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {erro}
            </p>
          )}

          <button
            onClick={handleSalvar}
            disabled={salvando || status === ocorrencia.status}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-4 px-6 rounded-xl font-semibold transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {salvando ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Salvar Alterações
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
