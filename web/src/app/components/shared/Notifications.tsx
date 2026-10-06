import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Lightbulb, Loader2, ThumbsUp, TriangleAlert } from 'lucide-react';
import { Navigation } from '../Navigation';
import {
  avisarMudancaNasNotificacoes,
  encerrarSessao,
  listarNotificacoes,
  marcarNotificacao,
  marcarTodasComoLidas,
  usuarioLogado,
  type Notificacao,
  type Papel,
  type StatusOcorrencia,
  type TipoFeedback,
} from '../../services/api';

const POR_PAGINA = 20;

// Classes inteiras: o Tailwind só gera o que encontra escrito.
const CONFIG_TIPO: Record<TipoFeedback, { rotulo: string; icone: typeof Bell; classe: string }> = {
  ELOGIO: { rotulo: 'Elogio', icone: ThumbsUp, classe: 'text-green-600 bg-green-100' },
  SUGESTAO: { rotulo: 'Sugestão', icone: Lightbulb, classe: 'text-blue-600 bg-blue-100' },
  RECLAMACAO: { rotulo: 'Reclamação', icone: TriangleAlert, classe: 'text-red-600 bg-red-100' },
};

const TIPO_DESCONHECIDO = { rotulo: 'Feedback', icone: Bell, classe: 'text-gray-600 bg-gray-100' };

const CONFIG_STATUS: Record<StatusOcorrencia, { rotulo: string; classe: string }> = {
  PENDENTE: { rotulo: 'Pendente', classe: 'bg-red-100 text-red-700' },
  EM_ANDAMENTO: { rotulo: 'Em andamento', classe: 'bg-amber-100 text-amber-700' },
  RESOLVIDO: { rotulo: 'Resolvido', classe: 'bg-green-100 text-green-700' },
};

// A tela é compartilhada pelos três papéis; a barra segue a cor de quem está logado.
const BARRA_POR_PAPEL: Record<Papel, 'coordinator' | 'manager' | 'admin'> = {
  COORDENADOR: 'coordinator',
  GERENTE: 'manager',
  ADMINISTRADOR: 'admin',
};

type Filtro = 'todas' | 'nao-lidas';

export function Notifications() {
  const navigate = useNavigate();
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [total, setTotal] = useState(0);
  const [naoLidas, setNaoLidas] = useState(0);
  const [paginaCarregada, setPaginaCarregada] = useState(0);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [marcandoTodas, setMarcandoTodas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const token = localStorage.getItem('echo_token');
  const papel = usuarioLogado()?.papel;
  const telaDeLogin = papel === 'COORDENADOR' ? '/coordenador/login' : '/gerente/login';
  const requisicaoAtual = useRef(0);

  const tratarFalha = useCallback(
    (e: Error & { status?: number }) => {
      if (e.status === 401) {
        encerrarSessao();
        navigate(telaDeLogin);
        return;
      }
      setErro(e.message || 'Não foi possível carregar as notificações.');
    },
    [navigate, telaDeLogin]
  );

  const carregarPagina = useCallback(
    (pagina: number) => {
      if (!token) {
        navigate(telaDeLogin);
        return;
      }

      const minhaVez = ++requisicaoAtual.current;
      if (pagina === 1) setCarregando(true);
      else setCarregandoMais(true);
      setErro(null);

      listarNotificacoes(token, {
        pagina,
        porPagina: POR_PAGINA,
        ...(filtro === 'nao-lidas' && { lida: false }),
      })
        .then((res) => {
          if (minhaVez !== requisicaoAtual.current) return;
          // Feedback que chega com a tela aberta empurra a lista no servidor, e a
          // página seguinte repete o último item já mostrado. Descarta o repetido.
          setNotificacoes((anteriores) => {
            if (pagina === 1) return res.itens;
            const jaNaTela = new Set(anteriores.map((n) => n.id));
            return [...anteriores, ...res.itens.filter((n) => !jaNaTela.has(n.id))];
          });
          setTotal(res.total);
          setNaoLidas(res.naoLidas);
          setPaginaCarregada(res.pagina);
        })
        .catch((e: Error & { status?: number }) => {
          if (minhaVez === requisicaoAtual.current) tratarFalha(e);
        })
        .finally(() => {
          if (minhaVez !== requisicaoAtual.current) return;
          setCarregando(false);
          setCarregandoMais(false);
        });
    },
    [token, filtro, navigate, telaDeLogin, tratarFalha]
  );

  useEffect(() => {
    carregarPagina(1);
    return () => {
      requisicaoAtual.current++;
    };
  }, [carregarPagina]);

  // Atualiza a lista na hora, sem esperar o servidor, e conserta se ele recusar.
  const aplicarLida = (id: string, lida: boolean) => {
    setNotificacoes((lista) => lista.map((n) => (n.id === id ? { ...n, lida } : n)));
    setNaoLidas((contagem) => Math.max(0, contagem + (lida ? -1 : 1)));
  };

  const marcar = async (notificacao: Notificacao, lida: boolean) => {
    if (!token) return;
    aplicarLida(notificacao.id, lida);
    try {
      await marcarNotificacao(notificacao.id, lida, token);
      avisarMudancaNasNotificacoes();
      // No filtro "Não lidas", a marcada sai do conjunto do servidor e a próxima
      // página pularia itens nunca mostrados. Recomeçar da primeira evita o buraco.
      if (filtro === 'nao-lidas') carregarPagina(1);
    } catch (e) {
      aplicarLida(notificacao.id, !lida);
      tratarFalha(e as Error & { status?: number });
    }
  };

  // Abrir a notificação é ler: marca e vai para a ocorrência. Se a marcação falhar,
  // abre do mesmo jeito — o que importa é a pessoa chegar no feedback.
  const abrir = async (notificacao: Notificacao) => {
    if (token && !notificacao.lida) {
      try {
        await marcarNotificacao(notificacao.id, true, token);
        avisarMudancaNasNotificacoes();
      } catch {
        // segue para a ocorrência
      }
    }
    navigate(`/coordenador/ocorrencia/${notificacao.feedback.id}`);
  };

  const marcarTodas = async () => {
    if (!token) return;
    setMarcandoTodas(true);
    setErro(null);
    try {
      await marcarTodasComoLidas(token);
      avisarMudancaNasNotificacoes();
      carregarPagina(1);
    } catch (e) {
      tratarFalha(e as Error & { status?: number });
    } finally {
      setMarcandoTodas(false);
    }
  };

  const haMais = notificacoes.length < total && paginaCarregada > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation title="Notificações" role={papel ? BARRA_POR_PAPEL[papel] ?? 'admin' : 'admin'} />
      <div className="max-w-3xl mx-auto p-4 pb-8">
        <div className="pt-6 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notificações</h1>
            <p className="text-gray-600 mt-1">
              {naoLidas > 0
                ? `${naoLidas} não ${naoLidas === 1 ? 'lida' : 'lidas'}`
                : 'Tudo em dia'}
            </p>
          </div>
          {naoLidas > 0 && (
            <button
              onClick={marcarTodas}
              disabled={marcandoTodas}
              className="flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded-lg font-semibold transition-colors disabled:opacity-60"
            >
              {marcandoTodas ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCheck className="w-4 h-4" />
              )}
              Marcar todas como lidas
            </button>
          )}
        </div>

        <div className="flex gap-2 mb-4">
          {(
            [
              ['todas', 'Todas'],
              ['nao-lidas', 'Não lidas'],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              onClick={() => setFiltro(valor)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                filtro === valor
                  ? 'bg-gray-700 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {erro && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {erro}
          </p>
        )}

        {carregando ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-gray-700" />
          </div>
        ) : notificacoes.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">
              {filtro === 'nao-lidas'
                ? 'Nenhuma notificação por ler.'
                : 'Nenhuma notificação ainda. Cada feedback novo aparece aqui.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notificacoes.map((notificacao) => {
              const { feedback } = notificacao;
              const tipo = CONFIG_TIPO[feedback.tipo] ?? TIPO_DESCONHECIDO;
              const status = CONFIG_STATUS[feedback.status];
              const Icone = tipo.icone;

              return (
                <div
                  key={notificacao.id}
                  // No celular o botão de marcar desce para baixo do conteúdo; ao lado,
                  // ele espremia o texto numa coluna estreita.
                  className={`bg-white rounded-xl p-4 border-l-4 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 ${
                    notificacao.lida ? 'border-gray-200 shadow-sm' : 'border-gray-700 shadow-md'
                  }`}
                >
                  <button
                    onClick={() => abrir(notificacao)}
                    className="flex-1 min-w-0 flex items-start gap-4 text-left"
                  >
                    <span
                      className={`w-11 h-11 ${tipo.classe} rounded-lg flex items-center justify-center flex-shrink-0`}
                    >
                      <Icone className="w-5 h-5" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`font-semibold ${notificacao.lida ? 'text-gray-600' : 'text-gray-900'}`}
                        >
                          {tipo.rotulo} {feedback.area ? `— ${feedback.area.nome}` : ''}
                        </span>
                        {!notificacao.lida && (
                          <span className="w-2 h-2 bg-blue-600 rounded-full" aria-label="Não lida" />
                        )}
                        {status && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${status.classe}`}
                          >
                            {status.rotulo}
                          </span>
                        )}
                      </span>
                      {feedback.avaliacoes.length > 0 && (
                        <span className="block text-sm text-gray-600 mt-1">
                          {feedback.avaliacoes.map((a) => `${a.categoria} ${a.estrelas}★`).join(' · ')}
                        </span>
                      )}
                      {feedback.comentario && (
                        <span className="block text-sm text-gray-500 mt-1 line-clamp-2">
                          “{feedback.comentario}”
                        </span>
                      )}
                      <span className="block text-xs text-gray-400 mt-2">
                        {new Date(notificacao.criadoEm).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>
                  </button>

                  <button
                    onClick={() => marcar(notificacao, !notificacao.lida)}
                    className="self-end sm:self-start text-xs text-gray-500 hover:text-gray-800 font-semibold whitespace-nowrap sm:pt-1"
                  >
                    {notificacao.lida ? 'Marcar como não lida' : 'Marcar como lida'}
                  </button>
                </div>
              );
            })}

            {haMais && (
              <button
                onClick={() => carregarPagina(paginaCarregada + 1)}
                disabled={carregandoMais}
                className="w-full py-3 rounded-xl bg-white text-gray-700 font-semibold shadow-sm hover:bg-gray-100 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {carregandoMais && <Loader2 className="w-4 h-4 animate-spin" />}
                Carregar mais
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
