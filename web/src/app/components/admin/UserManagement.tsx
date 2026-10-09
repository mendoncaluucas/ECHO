import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { KeyRound, Loader2, Pencil, Plus, Search, UserCheck, UserX, Users, X } from 'lucide-react';
import {
  atualizarUsuario,
  criarUsuario,
  listarUsuarios,
  redefinirSenha,
  tokenDaSessao,
  usuarioLogado,
  type EdicaoUsuario,
  type Papel,
  type UsuarioGestao,
} from '../../services/api';
import { ROTULO_DO_PAPEL } from '../../navegacao';
import { avisarRapido } from '../../avisoRapido';
import { AvisoDeErro, CabecalhoDaPagina, Cartao, Esqueleto, EstadoVazio, Pagina } from '../layout/Pagina';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';

// Classes inteiras: o Tailwind só gera o que encontra escrito.
const SELO_DO_PAPEL: Record<Papel, string> = {
  ADMINISTRADOR: 'bg-marca-escura text-white',
  GERENTE: 'bg-accent text-accent-foreground',
  COORDENADOR: 'bg-andamento-fundo text-andamento',
};

// O que cada papel pode, dito no formulário: escolher "Gerente" sem saber o que ele vê
// era chute.
const O_QUE_O_PAPEL_FAZ: Record<Papel, string> = {
  COORDENADOR: 'Trata as ocorrências e recebe as notificações.',
  GERENTE: 'Além disso, vê o painel, o registro e os relatórios.',
  ADMINISTRADOR: 'Acesso a tudo, inclusive usuários, QR Codes e configurações.',
};

const PAPEIS = Object.keys(ROTULO_DO_PAPEL) as Papel[];

// Se o backend ganhar um papel novo antes de um deploy do front, aparece neutro.
const rotuloDoPapel = (papel: string) => ROTULO_DO_PAPEL[papel as Papel] ?? papel;
const seloDoPapel = (papel: string) => SELO_DO_PAPEL[papel as Papel] ?? 'bg-muted text-muted-foreground';

const TAMANHO_MINIMO_DA_SENHA = 8;

type Mostrar = 'ativos' | 'inativos' | 'todos';

type Formulario = { nome: string; email: string; senha: string; papel: Papel; setor: string };
const FORMULARIO_VAZIO: Formulario = { nome: '', email: '', senha: '', papel: 'COORDENADOR', setor: '' };

type Janela =
  | { tipo: 'criar' }
  | { tipo: 'editar'; usuario: UsuarioGestao }
  | { tipo: 'senha'; usuario: UsuarioGestao }
  | { tipo: 'desativar'; usuario: UsuarioGestao };

const campo =
  'h-11 w-full rounded-xl border border-border bg-input-background px-3.5 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const rotuloDoCampo = 'mb-1.5 block text-sm font-semibold';
const botaoPrimario =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground transition-colors hover:bg-[#0a5242] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const botaoSecundario =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const botaoDeIcone =
  'flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

// O 409 da API é genérico ("Registro já existe"). Aqui o único campo único é o
// e-mail, então vale dizer qual é o problema em vez de repassar a mensagem crua.
function mensagemDeFalha(e: unknown) {
  const status = (e as { status?: number }).status;
  if (status === 409) return 'Este e-mail já está cadastrado para outro usuário.';
  if (status === 403) return 'Só administradores podem gerenciar usuários.';
  return e instanceof Error && e.message ? e.message : 'Algo deu errado. Tente novamente.';
}

export function UserManagement() {
  const token = tokenDaSessao() ?? '';
  const euId = usuarioLogado()?.id ?? null;

  const [parametros, setParametros] = useSearchParams();
  const pedido = parametros.get('mostrar');
  const mostrar: Mostrar = pedido === 'inativos' || pedido === 'todos' ? pedido : 'ativos';
  const mudarMostrar = (novo: Mostrar) =>
    setParametros(novo === 'ativos' ? {} : { mostrar: novo }, { replace: true });

  const [usuarios, setUsuarios] = useState<UsuarioGestao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [janela, setJanela] = useState<Janela | null>(null);
  // Ao fechar a janela, o foco volta ao botão que a abriu. O diálogo só faz isso
  // sozinho com um gatilho próprio; aqui ele é aberto pelo estado, e o foco caía no
  // topo da página.
  const quemAbriu = useRef<HTMLElement | null>(null);
  const abrir = (nova: Janela) => {
    quemAbriu.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setJanela(nova);
  };
  const [alternandoId, setAlternandoId] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  // Só a resposta da busca mais recente vale: salvar e desativar em sequência podiam
  // terminar fora de ordem e a resposta antiga sobrescrever a nova.
  const buscaAtual = useRef(0);

  // Sessão vencida (401) é tratada no serviço da API, que leva ao login.
  const carregar = () => {
    const minhaVez = ++buscaAtual.current;
    setErro(null);
    listarUsuarios(token)
      .then((res) => {
        if (minhaVez === buscaAtual.current) setUsuarios(res.itens);
      })
      .catch((e) => {
        if (minhaVez === buscaAtual.current) setErro(mensagemDeFalha(e));
      });
  };

  useEffect(() => {
    carregar();
    return () => {
      buscaAtual.current++;
    };
    // carregar só depende do token, que já está aqui.
  }, [token, tentativa]);

  const reativar = async (usuario: UsuarioGestao) => {
    setErro(null);
    setAlternandoId(usuario.id);
    try {
      await atualizarUsuario(usuario.id, { ativo: true }, token);
      avisarRapido(`Acesso de ${usuario.nome} reativado`);
      carregar();
    } catch (e) {
      setErro(mensagemDeFalha(e));
    } finally {
      setAlternandoId(null);
    }
  };

  const ativos = usuarios?.filter((u) => u.ativo) ?? [];
  const contagem: Record<Mostrar, number> = {
    ativos: ativos.length,
    inativos: (usuarios?.length ?? 0) - ativos.length,
    todos: usuarios?.length ?? 0,
  };

  const termo = busca.trim().toLowerCase();
  const visiveis = (usuarios ?? [])
    .filter((u) => (mostrar === 'todos' ? true : mostrar === 'ativos' ? u.ativo : !u.ativo))
    .filter((u) => !termo || u.nome.toLowerCase().includes(termo) || u.email.toLowerCase().includes(termo))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo="Usuários"
        descricao="Quem entra no Echo e o que cada um pode fazer."
        acoes={
          <button type="button" onClick={() => abrir({ tipo: 'criar' })} className={botaoPrimario}>
            <Plus className="size-5" aria-hidden="true" />
            Adicionar usuário
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Mostrar" className="inline-flex gap-1 rounded-xl bg-muted p-1">
          {(
            [
              ['ativos', 'Ativos'],
              ['inativos', 'Inativos'],
              ['todos', 'Todos'],
            ] as const
          ).map(([valor, rotulo]) => {
            const escolhido = mostrar === valor;
            return (
              <button
                key={valor}
                type="button"
                aria-pressed={escolhido}
                onClick={() => mudarMostrar(valor)}
                className={`inline-flex h-9 items-center gap-2 rounded-[9px] px-3.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  escolhido ? 'bg-card font-bold text-foreground shadow-sm' : 'font-semibold text-[#3a3f4a] hover:text-foreground'
                }`}
              >
                {rotulo}
                {usuarios && (
                  <span className="min-w-6 rounded-full bg-[#e2e2dc] px-1.5 text-center text-xs leading-5 font-bold tabular-nums text-[#3a3f4a]">
                    {contagem[valor]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="relative min-w-0 flex-[1_1_16rem]">
          <label htmlFor="busca-usuarios" className="sr-only">
            Buscar por nome ou e-mail
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id="busca-usuarios"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className="h-11 w-full rounded-xl border border-border bg-input-background pr-10 pl-10 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-search-cancel-button]:hidden"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              aria-label="Limpar a busca"
              className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {erro && (
        <div className="mb-4">
          <AvisoDeErro mensagem={erro} aoTentarDeNovo={usuarios ? undefined : () => setTentativa((t) => t + 1)} />
        </div>
      )}

      {!usuarios ? (
        !erro && (
          <Cartao>
            <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando usuários">
              {[0, 1, 2].map((i) => (
                <Esqueleto key={i} className="h-14" />
              ))}
            </div>
          </Cartao>
        )
      ) : visiveis.length === 0 ? (
        <EstadoVazio
          icone={Users}
          titulo={
            termo
              ? 'Ninguém com esse nome ou e-mail'
              : mostrar === 'inativos'
                ? 'Nenhum usuário desativado'
                : 'Nenhum usuário'
          }
        />
      ) : (
        <Cartao>
          <ul className="-my-1 divide-y divide-[#efefea]">
            {visiveis.map((u) => {
              const souEu = u.id === euId;
              return (
                <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <span
                    className={`flex size-10 flex-none items-center justify-center rounded-full text-sm font-extrabold ${
                      u.ativo ? 'bg-[#d7e9e2] text-accent-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                    aria-hidden="true"
                  >
                    {iniciais(u.nome)}
                  </span>
                  <div className="min-w-0 flex-[1_1_12rem]">
                    <p className={`font-semibold break-words ${u.ativo ? '' : 'text-muted-foreground'}`}>
                      {u.nome}
                      {souEu && <span className="font-normal text-muted-foreground"> (você)</span>}
                    </p>
                    <p className="text-sm break-all text-muted-foreground">{u.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${seloDoPapel(u.papel)}`}>
                      {rotuloDoPapel(u.papel)}
                    </span>
                    {u.setor && <span className="text-sm text-muted-foreground">{u.setor}</span>}
                    {!u.ativo && (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
                        Desativado
                      </span>
                    )}
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => abrir({ tipo: 'editar', usuario: u })}
                      aria-label={`Editar ${u.nome}`}
                      title="Editar"
                      className={botaoDeIcone}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => abrir({ tipo: 'senha', usuario: u })}
                      aria-label={`Redefinir a senha de ${u.nome}`}
                      title="Redefinir senha"
                      className={botaoDeIcone}
                    >
                      <KeyRound className="size-4" aria-hidden="true" />
                    </button>
                    {/* A própria conta não tem a ação: o backend recusa, e oferecer um
                        botão que sempre dá erro é pior que não ter. O espaço fica, para
                        a coluna de selos não desalinhar nessa linha. */}
                    {souEu && <span className="size-9 flex-none" aria-hidden="true" />}
                    {!souEu &&
                      (u.ativo ? (
                        <button
                          type="button"
                          onClick={() => abrir({ tipo: 'desativar', usuario: u })}
                          aria-label={`Desativar ${u.nome}`}
                          title="Desativar"
                          className={`${botaoDeIcone} hover:bg-perigo-fundo hover:text-perigo`}
                        >
                          <UserX className="size-4" aria-hidden="true" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => reativar(u)}
                          disabled={alternandoId === u.id}
                          aria-label={`Reativar ${u.nome}`}
                          title="Reativar"
                          className={`${botaoDeIcone} disabled:opacity-50`}
                        >
                          {alternandoId === u.id ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <UserCheck className="size-4" aria-hidden="true" />
                          )}
                        </button>
                      ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}

      <Dialog open={janela !== null} onOpenChange={(aberto) => !aberto && setJanela(null)}>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-card p-6 sm:max-w-md"
          onCloseAutoFocus={(e) => {
            // Se o botão sumiu (a pessoa desativada saiu da aba "Ativos"), fica o padrão.
            if (quemAbriu.current?.isConnected) {
              e.preventDefault();
              quemAbriu.current.focus();
            }
          }}
        >
          {janela && (
            <ConteudoDaJanela
              // Chave por janela: abrir outro usuário recomeça o formulário do zero.
              key={janela.tipo + ('usuario' in janela ? janela.usuario.id : '')}
              janela={janela}
              token={token}
              euId={euId}
              aoConcluir={(mensagem) => {
                setJanela(null);
                avisarRapido(mensagem);
                carregar();
              }}
              aoCancelar={() => setJanela(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Pagina>
  );
}

function ConteudoDaJanela({
  janela,
  token,
  euId,
  aoConcluir,
  aoCancelar,
}: {
  janela: Janela;
  token: string;
  euId: string | null;
  aoConcluir: (mensagem: string) => void;
  aoCancelar: () => void;
}) {
  // A API recusa tirar o próprio acesso de administrador. Travar o campo evita
  // escolher, salvar e só então tomar o erro.
  const editandoASiMesmo = janela.tipo === 'editar' && janela.usuario.id === euId;
  const [formulario, setFormulario] = useState<Formulario>(() =>
    janela.tipo === 'editar'
      ? {
          nome: janela.usuario.nome,
          email: janela.usuario.email,
          senha: '',
          papel: janela.usuario.papel,
          setor: janela.usuario.setor ?? '',
        }
      : FORMULARIO_VAZIO
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const mudar = (campoAlterado: Partial<Formulario>) => setFormulario((f) => ({ ...f, ...campoAlterado }));

  const pedeSenha = janela.tipo === 'criar' || janela.tipo === 'senha';
  const senhaCurta = pedeSenha && formulario.senha.length > 0 && formulario.senha.length < TAMANHO_MINIMO_DA_SENHA;
  const podeSalvar =
    janela.tipo === 'desativar'
      ? true
      : janela.tipo === 'senha'
        ? formulario.senha.length >= TAMANHO_MINIMO_DA_SENHA
        : formulario.nome.trim().length > 0 &&
          formulario.email.trim().length > 0 &&
          (janela.tipo === 'editar' || formulario.senha.length >= TAMANHO_MINIMO_DA_SENHA);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!podeSalvar) return;
    setErro(null);
    setSalvando(true);
    try {
      if (janela.tipo === 'criar') {
        await criarUsuario(
          {
            nome: formulario.nome.trim(),
            email: formulario.email.trim(),
            senha: formulario.senha,
            papel: formulario.papel,
            setor: formulario.setor.trim() || null,
          },
          token
        );
        aoConcluir(`Usuário adicionado: ${formulario.nome.trim()}`);
      } else if (janela.tipo === 'editar') {
        const alteracoes: EdicaoUsuario = {
          nome: formulario.nome.trim(),
          email: formulario.email.trim(),
          papel: formulario.papel,
          setor: formulario.setor.trim() || null,
        };
        await atualizarUsuario(janela.usuario.id, alteracoes, token);
        aoConcluir('Alterações salvas');
      } else if (janela.tipo === 'senha') {
        await redefinirSenha(janela.usuario.id, formulario.senha, token);
        aoConcluir(`Senha de ${janela.usuario.nome} redefinida`);
      } else {
        await atualizarUsuario(janela.usuario.id, { ativo: false }, token);
        aoConcluir(`Acesso de ${janela.usuario.nome} desativado`);
      }
    } catch (falha) {
      setErro(mensagemDeFalha(falha));
      setSalvando(false);
    }
  };

  const titulo = {
    criar: 'Adicionar usuário',
    editar: 'Editar usuário',
    senha: 'Redefinir senha',
    desativar: 'Desativar usuário',
  }[janela.tipo];

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
      <div className="pr-6">
        <DialogTitle className="text-xl font-extrabold">{titulo}</DialogTitle>
        {janela.tipo === 'senha' && (
          <DialogDescription className="mt-1.5 text-sm">
            Nova senha para <strong className="text-foreground">{janela.usuario.nome}</strong>. A anterior deixa de valer na
            hora; avise a pessoa da senha nova.
          </DialogDescription>
        )}
        {janela.tipo === 'desativar' && (
          <DialogDescription className="mt-1.5 text-sm">
            <strong className="text-foreground">{janela.usuario.nome}</strong> perde o acesso na hora, inclusive se estiver
            usando o Echo agora. O histórico continua no log, e dá para reativar depois.
          </DialogDescription>
        )}
        {(janela.tipo === 'criar' || janela.tipo === 'editar') && (
          <DialogDescription className="sr-only">Dados de acesso e papel da pessoa no Echo.</DialogDescription>
        )}
      </div>

      {(janela.tipo === 'criar' || janela.tipo === 'editar') && (
        <>
          <div>
            <label htmlFor="usuario-nome" className={rotuloDoCampo}>
              Nome completo
            </label>
            <input
              id="usuario-nome"
              autoFocus
              value={formulario.nome}
              onChange={(e) => mudar({ nome: e.target.value })}
              autoComplete="off"
              className={campo}
            />
          </div>
          <div>
            <label htmlFor="usuario-email" className={rotuloDoCampo}>
              E-mail
            </label>
            <input
              id="usuario-email"
              type="email"
              value={formulario.email}
              onChange={(e) => mudar({ email: e.target.value })}
              autoComplete="off"
              placeholder="nome@sinuelo.com"
              className={campo}
            />
          </div>
        </>
      )}

      {pedeSenha && (
        <div>
          <label htmlFor="usuario-senha" className={rotuloDoCampo}>
            {janela.tipo === 'criar' ? 'Senha inicial' : 'Nova senha'}
          </label>
          <input
            id="usuario-senha"
            type="password"
            autoFocus={janela.tipo === 'senha'}
            value={formulario.senha}
            onChange={(e) => mudar({ senha: e.target.value })}
            autoComplete="new-password"
            aria-describedby="usuario-senha-dica"
            className={campo}
          />
          <p
            id="usuario-senha-dica"
            className={`mt-1.5 text-sm ${senhaCurta ? 'font-semibold text-atencao' : 'text-muted-foreground'}`}
          >
            Pelo menos {TAMANHO_MINIMO_DA_SENHA} caracteres.
          </p>
        </div>
      )}

      {(janela.tipo === 'criar' || janela.tipo === 'editar') && (
        <>
          <div>
            <label htmlFor="usuario-papel" className={rotuloDoCampo}>
              Papel
            </label>
            <select
              id="usuario-papel"
              value={formulario.papel}
              onChange={(e) => mudar({ papel: e.target.value as Papel })}
              disabled={editandoASiMesmo}
              aria-describedby="usuario-papel-dica"
              className={`${campo} disabled:cursor-not-allowed disabled:bg-muted`}
            >
              {PAPEIS.map((papel) => (
                <option key={papel} value={papel}>
                  {ROTULO_DO_PAPEL[papel]}
                </option>
              ))}
            </select>
            <p id="usuario-papel-dica" className="mt-1.5 text-sm text-muted-foreground">
              {editandoASiMesmo
                ? 'Você não pode tirar o próprio acesso de administrador. Peça a outro administrador.'
                : O_QUE_O_PAPEL_FAZ[formulario.papel]}
            </p>
          </div>
          <div>
            <label htmlFor="usuario-setor" className={rotuloDoCampo}>
              Setor <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <input
              id="usuario-setor"
              value={formulario.setor}
              onChange={(e) => mudar({ setor: e.target.value })}
              placeholder="Ex.: Cozinha, Salão"
              className={campo}
            />
          </div>
        </>
      )}

      {erro && (
        <p role="alert" className="rounded-xl bg-perigo-fundo px-3.5 py-3 text-sm font-semibold text-perigo">
          {erro}
        </p>
      )}

      <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {/* Na confirmação de desativar, o foco começa no "Cancelar": um Enter distraído
            não pode tirar o acesso de alguém. */}
        <button
          type="button"
          onClick={aoCancelar}
          autoFocus={janela.tipo === 'desativar'}
          className={botaoSecundario}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={salvando || !podeSalvar}
          className={
            janela.tipo === 'desativar'
              ? 'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-perigo px-4 font-semibold text-white transition-colors hover:bg-[#8c1d15] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
              : botaoPrimario
          }
        >
          {salvando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {janela.tipo === 'criar'
            ? 'Adicionar'
            : janela.tipo === 'desativar'
              ? 'Desativar'
              : janela.tipo === 'senha'
                ? 'Redefinir senha'
                : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
