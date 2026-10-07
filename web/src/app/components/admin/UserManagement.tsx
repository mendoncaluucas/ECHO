import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, UserX, UserCheck, Search, KeyRound, Loader2 } from 'lucide-react';
import {
  atualizarUsuario,
  criarUsuario,
  encerrarSessao,
  listarUsuarios,
  redefinirSenha,
  usuarioLogado,
  type EdicaoUsuario,
  type Papel,
  type UsuarioGestao,
} from '../../services/api';

// Classes inteiras: o Tailwind varre o código por strings completas.
const CONFIG_PAPEL: Record<Papel, { rotulo: string; classe: string }> = {
  COORDENADOR: { rotulo: 'Coordenador', classe: 'bg-purple-100 text-purple-700' },
  GERENTE: { rotulo: 'Gerente', classe: 'bg-orange-100 text-orange-700' },
  ADMINISTRADOR: { rotulo: 'Administrador', classe: 'bg-slate-700 text-white' },
};

// Se o backend ganhar um papel novo antes de um deploy do front, a linha aparece
// em cinza em vez de derrubar a tela.
const PAPEL_DESCONHECIDO = { rotulo: 'Outro', classe: 'bg-gray-100 text-gray-700' };

const PAPEIS = Object.keys(CONFIG_PAPEL) as Papel[];

const TAMANHO_MINIMO_DA_SENHA = 8;

type Formulario = {
  nome: string;
  email: string;
  senha: string;
  papel: Papel;
  setor: string;
};

const FORMULARIO_VAZIO: Formulario = {
  nome: '',
  email: '',
  senha: '',
  papel: 'COORDENADOR',
  setor: '',
};

const campo =
  'w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-700';
const rotulo = 'block text-sm font-semibold text-gray-700 mb-2';

export function UserManagement() {
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState<UsuarioGestao[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);

  const [modalAberto, setModalAberto] = useState<'criar' | 'editar' | 'senha' | null>(null);
  const [emFoco, setEmFoco] = useState<UsuarioGestao | null>(null);
  const [formulario, setFormulario] = useState<Formulario>(FORMULARIO_VAZIO);
  const [erroDoModal, setErroDoModal] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const token = localStorage.getItem('echo_token');
  const euId = usuarioLogado()?.id ?? null;

  const tratarFalha = (e: unknown, ondeMostrar: (mensagem: string) => void) => {
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
    // O 409 da API é genérico ("Registro já existe"). Aqui o único campo único é o
    // e-mail, então vale dizer qual é o problema em vez de repassar a mensagem crua.
    if (status === 409) {
      ondeMostrar('Este e-mail já está cadastrado para outro usuário.');
      return;
    }
    ondeMostrar(e instanceof Error ? e.message : 'Algo deu errado. Tente novamente.');
  };

  // Identifica a busca mais recente. Sem isso, duas recargas seguidas (salvar e
  // alternar situação em sequência) podem terminar fora de ordem e a resposta antiga
  // sobrescrever a nova, mostrando dado velho.
  const buscaAtual = useRef(0);

  const carregar = () => {
    if (!token) return;
    const minhaVez = ++buscaAtual.current;

    listarUsuarios(token)
      .then((res) => {
        if (minhaVez !== buscaAtual.current) return;
        setUsuarios(res.itens);
      })
      .catch((e) => {
        if (minhaVez !== buscaAtual.current) return;
        tratarFalha(e, setErro);
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
      // Descarta o que estiver em voo quando a tela sai: evita setState em
      // componente desmontado.
      buscaAtual.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const abrirCriar = () => {
    setFormulario(FORMULARIO_VAZIO);
    setEmFoco(null);
    setErroDoModal(null);
    setModalAberto('criar');
  };

  const abrirEditar = (usuario: UsuarioGestao) => {
    setFormulario({
      nome: usuario.nome,
      email: usuario.email,
      senha: '',
      papel: usuario.papel,
      setor: usuario.setor ?? '',
    });
    setEmFoco(usuario);
    setErroDoModal(null);
    setModalAberto('editar');
  };

  const abrirSenha = (usuario: UsuarioGestao) => {
    setFormulario({ ...FORMULARIO_VAZIO, papel: usuario.papel });
    setEmFoco(usuario);
    setErroDoModal(null);
    setModalAberto('senha');
  };

  const fechar = () => {
    setModalAberto(null);
    setEmFoco(null);
    setErroDoModal(null);
  };

  const salvar = async () => {
    if (!token) return;
    setErroDoModal(null);
    setSalvando(true);
    try {
      if (modalAberto === 'criar') {
        await criarUsuario(
          {
            nome: formulario.nome,
            email: formulario.email,
            senha: formulario.senha,
            papel: formulario.papel,
            setor: formulario.setor.trim() || null,
          },
          token
        );
      } else if (modalAberto === 'editar' && emFoco) {
        const alteracoes: EdicaoUsuario = {
          nome: formulario.nome,
          email: formulario.email,
          papel: formulario.papel,
          setor: formulario.setor.trim() || null,
        };
        await atualizarUsuario(emFoco.id, alteracoes, token);
      } else if (modalAberto === 'senha' && emFoco) {
        await redefinirSenha(emFoco.id, formulario.senha, token);
      }
      fechar();
      carregar();
    } catch (e) {
      tratarFalha(e, setErroDoModal);
    } finally {
      setSalvando(false);
    }
  };

  const alternarSituacao = async (usuario: UsuarioGestao) => {
    if (!token) return;
    setErro(null);
    try {
      await atualizarUsuario(usuario.id, { ativo: !usuario.ativo }, token);
      carregar();
    } catch (e) {
      tratarFalha(e, setErro);
    }
  };

  const termo = busca.trim().toLowerCase();
  const filtrados = termo
    ? usuarios.filter(
        (u) =>
          u.nome.toLowerCase().includes(termo) || u.email.toLowerCase().includes(termo)
      )
    : usuarios;

  const moldura = (conteudo: React.ReactNode) => (
    <div>
      <div className="max-w-6xl mx-auto p-4 pb-8">
        <div className="pt-6 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Gerenciamento de Usuários</h1>
          <p className="text-gray-600 mt-1">Controle de acessos e permissões</p>
        </div>
        {conteudo}
      </div>
    </div>
  );

  if (semPermissao) {
    return moldura(
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center space-y-2">
        <h2 className="text-lg font-bold text-gray-900">Acesso restrito</h2>
        <p className="text-gray-600">
          Apenas administradores podem gerenciar usuários. Entre com uma conta de
          administrador para continuar.
        </p>
      </div>
    );
  }

  if (carregando) {
    return moldura(
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-700" />
      </div>
    );
  }

  const senhaCurta =
    (modalAberto === 'criar' || modalAberto === 'senha') &&
    formulario.senha.length > 0 &&
    formulario.senha.length < TAMANHO_MINIMO_DA_SENHA;

  const podeSalvar =
    modalAberto === 'senha'
      ? formulario.senha.length >= TAMANHO_MINIMO_DA_SENHA
      : formulario.nome.trim().length > 0 &&
        formulario.email.trim().length > 0 &&
        (modalAberto === 'editar' || formulario.senha.length >= TAMANHO_MINIMO_DA_SENHA);

  return moldura(
    <>
      <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nome ou e-mail..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className={`${campo} pl-10`}
              />
            </div>
          </div>
          <button
            onClick={abrirCriar}
            className="bg-slate-700 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Adicionar Usuário
          </button>
        </div>
      </div>

      {erro && (
        <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {erro}
        </p>
      )}

      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Nome</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">E-mail</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Perfil</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Setor</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtrados.map((usuario) => {
                const papel = CONFIG_PAPEL[usuario.papel] ?? PAPEL_DESCONHECIDO;
                const souEu = usuario.id === euId;

                return (
                  <tr key={usuario.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {usuario.nome}
                      {souEu && <span className="text-gray-400 font-normal"> (você)</span>}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{usuario.email}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${papel.classe}`}
                      >
                        {papel.rotulo}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{usuario.setor ?? '—'}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          usuario.ativo
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {usuario.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1">
                        <button
                          onClick={() => abrirEditar(usuario)}
                          title="Editar"
                          className="text-slate-700 hover:text-slate-900 p-2"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => abrirSenha(usuario)}
                          title="Redefinir senha"
                          className="text-slate-700 hover:text-slate-900 p-2"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        {/* A própria conta não aparece com a ação: o backend recusa, e
                            oferecer um botão que sempre dá erro é pior que não ter. */}
                        {!souEu && (
                          <button
                            onClick={() => alternarSituacao(usuario)}
                            title={usuario.ativo ? 'Desativar' : 'Reativar'}
                            className={
                              usuario.ativo
                                ? 'text-red-600 hover:text-red-700 p-2'
                                : 'text-green-600 hover:text-green-700 p-2'
                            }
                          >
                            {usuario.ativo ? (
                              <UserX className="w-4 h-4" />
                            ) : (
                              <UserCheck className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtrados.length === 0 && (
          <p className="px-6 py-10 text-center text-gray-600">
            {usuarios.length === 0
              ? 'Nenhum usuário cadastrado.'
              : 'Nenhum usuário encontrado para esta busca.'}
          </p>
        )}
      </div>

      {modalAberto && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full max-h-full overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {modalAberto === 'criar' && 'Adicionar Novo Usuário'}
              {modalAberto === 'editar' && 'Editar Usuário'}
              {modalAberto === 'senha' && 'Redefinir Senha'}
            </h2>

            {modalAberto === 'senha' ? (
              <div className="space-y-4">
                <p className="text-gray-600">
                  Definindo uma nova senha para <strong>{emFoco?.nome}</strong>. A senha
                  anterior deixa de valer imediatamente.
                </p>
                <div>
                  <label className={rotulo}>Nova senha</label>
                  <input
                    type="password"
                    value={formulario.senha}
                    onChange={(e) => setFormulario({ ...formulario, senha: e.target.value })}
                    placeholder="Mínimo de 8 caracteres"
                    className={campo}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className={rotulo}>Nome completo</label>
                  <input
                    type="text"
                    value={formulario.nome}
                    onChange={(e) => setFormulario({ ...formulario, nome: e.target.value })}
                    placeholder="Nome do usuário"
                    className={campo}
                  />
                </div>
                <div>
                  <label className={rotulo}>E-mail</label>
                  <input
                    type="email"
                    value={formulario.email}
                    onChange={(e) => setFormulario({ ...formulario, email: e.target.value })}
                    placeholder="email@restaurante.com"
                    className={campo}
                  />
                </div>
                {modalAberto === 'criar' && (
                  <div>
                    <label className={rotulo}>Senha inicial</label>
                    <input
                      type="password"
                      value={formulario.senha}
                      onChange={(e) => setFormulario({ ...formulario, senha: e.target.value })}
                      placeholder="Mínimo de 8 caracteres"
                      className={campo}
                    />
                  </div>
                )}
                <div>
                  <label className={rotulo}>Perfil</label>
                  <select
                    value={formulario.papel}
                    onChange={(e) =>
                      setFormulario({ ...formulario, papel: e.target.value as Papel })
                    }
                    className={campo}
                  >
                    {PAPEIS.map((papel) => (
                      <option key={papel} value={papel}>
                        {CONFIG_PAPEL[papel].rotulo}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={rotulo}>Setor (opcional)</label>
                  <input
                    type="text"
                    value={formulario.setor}
                    onChange={(e) => setFormulario({ ...formulario, setor: e.target.value })}
                    placeholder="Ex.: Cozinha, Salão"
                    className={campo}
                  />
                </div>
              </div>
            )}

            {senhaCurta && (
              <p className="mt-4 text-sm text-amber-700">
                A senha precisa ter ao menos {TAMANHO_MINIMO_DA_SENHA} caracteres.
              </p>
            )}

            {erroDoModal && (
              <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                {erroDoModal}
              </p>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={fechar}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-3 rounded-xl font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando || !podeSalvar}
                className="flex-1 bg-slate-700 hover:bg-slate-800 text-white py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                {modalAberto === 'criar' ? 'Adicionar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
