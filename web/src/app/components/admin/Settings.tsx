import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Clock,
  Shield,
  Building2,
  Plus,
  Check,
  X,
  Pencil,
  Loader2,
} from 'lucide-react';
import { Navigation } from '../Navigation';
import {
  atualizarArea,
  buscarConfiguracoes,
  criarArea,
  encerrarSessao,
  idadeDaSessaoEmHoras,
  listarAreas,
  salvarConfiguracoes,
  usuarioLogado,
  type Area,
} from '../../services/api';

const campo =
  'w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-700';

// Seções cuja funcionalidade ainda não existe no sistema. Mostrar o controle
// desligado e dizer de que ele depende é mais honesto do que um botão que finge
// salvar — e deixa claro para a equipe o que falta.
function SecaoPendente({
  icone,
  titulo,
  descricao,
  dependeDe,
}: {
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
  dependeDe: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 opacity-75">
      <div className="flex items-center gap-3 mb-3">
        {icone}
        <h2 className="text-xl font-bold text-gray-900">{titulo}</h2>
        <span className="ml-auto text-xs font-semibold bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
          Em desenvolvimento
        </span>
      </div>
      <p className="text-gray-600">{descricao}</p>
      <p className="text-sm text-gray-500 mt-2">Depende de: {dependeDe}</p>
    </div>
  );
}

const OPCOES_DE_DURACAO = [1, 2, 4, 8, 12, 24];

function rotuloDeHoras(horas: number) {
  return horas === 1 ? '1 hora' : `${horas} horas`;
}

// Tempo de sessão: por quanto tempo um login vale. O backend confere a idade da
// sessão a cada requisição, então salvar vale na hora para todas as sessões abertas.
function SecaoTempoDeSessao({
  token,
  aoFalhar,
}: {
  token: string;
  aoFalhar: (e: unknown) => void;
}) {
  const navigate = useNavigate();
  const [salvo, setSalvo] = useState<number | null>(null);
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmacao, setConfirmacao] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Sessão vencida e falta de permissão são da página (login, "acesso restrito").
  // O resto fica aqui: a página mostra erro dentro do cartão de áreas.
  const tratarFalha = (e: unknown) => {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) {
      aoFalhar(e);
      return;
    }
    setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
  };

  useEffect(() => {
    let ativo = true;
    buscarConfiguracoes(token)
      .then((res) => {
        if (!ativo) return;
        setSalvo(res.duracaoSessaoHoras);
        setEscolhido(res.duracaoSessaoHoras);
      })
      .catch((e) => {
        if (ativo) tratarFalha(e);
      });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Valor salvo fora da lista (gravado pela API, por exemplo) continua selecionável.
  const opcoes =
    salvo !== null && !OPCOES_DE_DURACAO.includes(salvo)
      ? [...OPCOES_DE_DURACAO, salvo].sort((a, b) => a - b)
      : OPCOES_DE_DURACAO;

  // Encurtar abaixo da idade da própria sessão desloga quem está salvando. Melhor
  // avisar antes do que surpreender com a tela de login.
  const idade = idadeDaSessaoEmHoras();
  const vaiEncerrarAPropria = escolhido !== null && idade !== null && idade > escolhido;

  const salvar = async () => {
    if (escolhido === null) return;
    setSalvando(true);
    setConfirmacao(null);
    setErro(null);
    try {
      const res = await salvarConfiguracoes({ duracaoSessaoHoras: escolhido }, token);
      if (vaiEncerrarAPropria) {
        encerrarSessao();
        navigate('/gerente/login');
        return;
      }
      setSalvo(res.duracaoSessaoHoras);
      setConfirmacao('Salvo. Já vale para todas as sessões abertas.');
    } catch (e) {
      tratarFalha(e);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <div className="flex items-center gap-3 mb-2">
        <Clock className="w-6 h-6 text-slate-700" />
        <h2 className="text-xl font-bold text-gray-900">Tempo de Sessão</h2>
      </div>
      <p className="text-gray-600 mb-4">
        Por quanto tempo um login continua válido. Depois disso, é preciso entrar de novo.
      </p>

      {erro && (
        <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {erro}
        </p>
      )}

      {salvo === null ? (
        !erro && <Loader2 className="w-6 h-6 animate-spin text-slate-700" />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={escolhido ?? ''}
              onChange={(e) => {
                setEscolhido(Number(e.target.value));
                setConfirmacao(null);
              }}
              className={campo}
            >
              {opcoes.map((horas) => (
                <option key={horas} value={horas}>
                  {rotuloDeHoras(horas)}
                  {horas === 8 ? ' (padrão)' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={salvar}
              disabled={salvando || escolhido === salvo}
              className="bg-slate-700 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {salvando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              Salvar
            </button>
          </div>

          <p className="text-sm text-gray-500 mt-3">
            Vale na hora para todas as sessões abertas: encurtar encerra as que já passaram do
            novo limite, e alongar estende as que ainda estão valendo.
          </p>

          {vaiEncerrarAPropria && escolhido !== salvo && (
            <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              A sua sessão está aberta há mais de {rotuloDeHoras(escolhido!)}. Ao salvar, você vai
              precisar entrar de novo.
            </p>
          )}
          {confirmacao && (
            <p className="mt-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              {confirmacao}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function AdminSettings() {
  const navigate = useNavigate();
  const [areas, setAreas] = useState<Area[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);

  const [novoNome, setNovoNome] = useState('');
  const [criando, setCriando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState('');
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const token = localStorage.getItem('echo_token');
  const buscaAtual = useRef(0);

  // A listagem de áreas é aberta, então sem esta checagem um gerente veria os botões
  // de editar e só descobriria que não pode ao clicar e tomar 403. O backend continua
  // sendo a autoridade — isto é só para não oferecer o que vai ser recusado.
  const naoEAdministrador = usuarioLogado()?.papel !== 'ADMINISTRADOR';

  const tratarFalha = (e: unknown) => {
    const status = (e as { status?: number }).status;
    if (status === 401) {
      encerrarSessao();
      navigate('/gerente/login');
      return;
    }
    if (status === 403) {
      setSemPermissao(true);
      return;
    }
    if (status === 409) {
      setErro('Já existe uma área com esse nome neste restaurante.');
      return;
    }
    setErro(e instanceof Error ? e.message : 'Algo deu errado. Tente novamente.');
  };

  const carregar = () => {
    const minhaVez = ++buscaAtual.current;
    listarAreas()
      .then((res) => {
        if (minhaVez === buscaAtual.current) setAreas(res.itens);
      })
      .catch((e) => {
        if (minhaVez === buscaAtual.current) tratarFalha(e);
      })
      .finally(() => {
        if (minhaVez === buscaAtual.current) setCarregando(false);
      });
  };

  useEffect(() => {
    if (!token) {
      navigate('/gerente/login');
      return;
    }
    carregar();
    return () => {
      buscaAtual.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const adicionar = async () => {
    if (!token || novoNome.trim().length === 0) return;
    setErro(null);
    setCriando(true);
    try {
      await criarArea(novoNome, token);
      setNovoNome('');
      carregar();
    } catch (e) {
      tratarFalha(e);
    } finally {
      setCriando(false);
    }
  };

  const salvarNome = async (area: Area) => {
    if (!token || nomeEditado.trim().length === 0) return;
    setErro(null);
    setSalvandoId(area.id);
    try {
      await atualizarArea(area.id, { nome: nomeEditado }, token);
      setEditandoId(null);
      carregar();
    } catch (e) {
      tratarFalha(e);
    } finally {
      setSalvandoId(null);
    }
  };

  const alternarSituacao = async (area: Area) => {
    if (!token) return;
    setErro(null);
    setSalvandoId(area.id);
    try {
      await atualizarArea(area.id, { ativo: !area.ativo }, token);
      carregar();
    } catch (e) {
      tratarFalha(e);
    } finally {
      setSalvandoId(null);
    }
  };

  const moldura = (conteudo: React.ReactNode) => (
    <div className="min-h-screen bg-slate-50">
      <Navigation title="Configurações do Sistema" role="admin" />
      <div className="max-w-4xl mx-auto p-4 pb-8">
        <div className="pt-6 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Configurações do Sistema</h1>
          <p className="text-gray-600 mt-1">Personalize preferências e segurança</p>
        </div>
        {conteudo}
      </div>
    </div>
  );

  if (semPermissao || naoEAdministrador) {
    return moldura(
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center space-y-2">
        <h2 className="text-lg font-bold text-gray-900">Acesso restrito</h2>
        <p className="text-gray-600">
          Apenas administradores podem alterar as configurações do sistema.
        </p>
      </div>
    );
  }

  return moldura(
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="flex items-center gap-3 mb-2">
          <Building2 className="w-6 h-6 text-slate-700" />
          <h2 className="text-xl font-bold text-gray-900">Setores e Áreas</h2>
        </div>
        <p className="text-gray-600 mb-6">
          Cada área pode receber um QR Code próprio. Áreas desativadas deixam de ser
          oferecidas na geração de códigos, mas continuam no histórico dos feedbacks.
        </p>

        {erro && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {erro}
          </p>
        )}

        {carregando ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-7 h-7 animate-spin text-slate-700" />
          </div>
        ) : (
          <div className="space-y-3">
            {areas.map((area) => {
              const emEdicao = editandoId === area.id;
              const ocupado = salvandoId === area.id;

              return (
                <div key={area.id} className="flex items-center gap-3">
                  {emEdicao ? (
                    <>
                      <input
                        type="text"
                        value={nomeEditado}
                        onChange={(e) => setNomeEditado(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') salvarNome(area);
                          if (e.key === 'Escape') setEditandoId(null);
                        }}
                        autoFocus
                        className="flex-1 px-4 py-3 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-700"
                      />
                      <button
                        onClick={() => salvarNome(area)}
                        disabled={ocupado}
                        title="Salvar"
                        className="text-green-600 hover:text-green-700 p-3 disabled:opacity-50"
                      >
                        <Check className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setEditandoId(null)}
                        title="Cancelar"
                        className="text-gray-500 hover:text-gray-700 p-3"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <div
                        className={`flex-1 px-4 py-3 border border-gray-200 rounded-xl flex items-center gap-3 ${
                          area.ativo ? 'bg-white' : 'bg-gray-50'
                        }`}
                      >
                        <span className={area.ativo ? 'text-gray-900' : 'text-gray-500'}>
                          {area.nome}
                        </span>
                        {!area.ativo && (
                          <span className="text-xs font-semibold bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                            Inativa
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setEditandoId(area.id);
                          setNomeEditado(area.nome);
                          setErro(null);
                        }}
                        title="Renomear"
                        className="text-slate-700 hover:text-slate-900 p-3"
                      >
                        <Pencil className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => alternarSituacao(area)}
                        disabled={ocupado}
                        className={`px-4 py-3 font-semibold disabled:opacity-50 ${
                          area.ativo
                            ? 'text-red-600 hover:text-red-700'
                            : 'text-green-600 hover:text-green-700'
                        }`}
                      >
                        {area.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                    </>
                  )}
                </div>
              );
            })}

            {areas.length === 0 && (
              <p className="text-center text-gray-600 py-6">Nenhuma área cadastrada ainda.</p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <input
                type="text"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') adicionar();
                }}
                placeholder="Nome da nova área. Ex.: Mesa 15, Varanda"
                className={campo}
              />
              <button
                onClick={adicionar}
                disabled={criando || novoNome.trim().length === 0}
                className="bg-slate-700 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-semibold transition-colors flex items-center gap-2 whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {criando ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Plus className="w-5 h-5" />
                )}
                Adicionar
              </button>
            </div>
          </div>
        )}
      </div>

      <SecaoPendente
        icone={<Bell className="w-6 h-6 text-slate-700" />}
        titulo="Preferências de Notificação"
        descricao="Os alertas de feedback novo já chegam dentro do sistema, no sino do cabeçalho, para toda a gestão ativa. Falta poder recebê-los também por e-mail ou como notificação do navegador."
        dependeDe="um provedor de envio de e-mail e o push do navegador, que exigem infraestrutura fora do sistema"
      />

      {token && <SecaoTempoDeSessao token={token} aoFalhar={tratarFalha} />}

      <SecaoPendente
        icone={<Shield className="w-6 h-6 text-slate-700" />}
        titulo="Retenção de Dados (LGPD)"
        descricao="Definir por quanto tempo os feedbacks são guardados antes de serem excluídos."
        dependeDe="rotina de expurgo periódico — guardar o prazo sem aplicá-lo não protege ninguém"
      />
    </div>
  );
}
