import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, Pencil, Plus, X } from 'lucide-react';
import {
  atualizarArea,
  buscarConfiguracoes,
  criarArea,
  deixarAvisoParaOLogin,
  encerrarSessao,
  idadeDaSessaoEmHoras,
  listarAreas,
  ROTA_DE_LOGIN,
  salvarConfiguracoes,
  tokenDaSessao,
  type Area,
} from '../../services/api';
import { avisarRapido } from '../../avisoRapido';
import { CabecalhoDaPagina, Cartao, Esqueleto, Pagina } from '../layout/Pagina';

const campo =
  'h-11 w-full min-w-0 rounded-xl border border-border bg-input-background px-3.5 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const botaoPrimario =
  'inline-flex h-11 flex-none items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground transition-colors hover:bg-[#0a5242] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const botaoDeIcone =
  'flex size-9 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function mensagemDeFalha(e: unknown) {
  const status = (e as { status?: number }).status;
  if (status === 409) return 'Já existe uma área com esse nome.';
  if (status === 403) return 'Só administradores podem alterar as configurações.';
  return e instanceof Error && e.message ? e.message : 'Algo deu errado. Tente novamente.';
}

export function AdminSettings() {
  const token = tokenDaSessao() ?? '';
  return (
    <Pagina>
      <CabecalhoDaPagina titulo="Configurações" descricao="As áreas do restaurante e as regras de acesso ao Echo." />
      {/* Duas colunas só em tela larga: as áreas são a lista que cresce, e ficam à
          esquerda; o resto é curto. */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <SecaoDeAreas token={token} />
        <div className="flex min-w-0 flex-col gap-4">
          <SecaoTempoDeSessao token={token} />
          <SecaoAindaNaoDisponivel />
        </div>
      </div>
    </Pagina>
  );
}

// ---------- Áreas ----------

function SecaoDeAreas({ token }: { token: string }) {
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState('');
  const [criando, setCriando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState('');
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const buscaAtual = useRef(0);

  // Sessão vencida (401) é tratada no serviço da API, que leva ao login.
  const carregar = () => {
    const minhaVez = ++buscaAtual.current;
    listarAreas()
      .then((res) => {
        if (minhaVez === buscaAtual.current) setAreas(res.itens);
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
  }, []);

  const adicionar = async (e: FormEvent) => {
    e.preventDefault();
    const nome = novoNome.trim();
    if (!nome) return;
    setErro(null);
    setCriando(true);
    try {
      await criarArea(nome, token);
      setNovoNome('');
      avisarRapido(`Área "${nome}" cadastrada. Gere o QR Code dela na tela de QR Codes.`);
      carregar();
    } catch (falha) {
      setErro(mensagemDeFalha(falha));
    } finally {
      setCriando(false);
    }
  };

  const salvarNome = async (area: Area) => {
    const nome = nomeEditado.trim();
    if (!nome) return;
    if (nome === area.nome) {
      setEditandoId(null);
      return;
    }
    setErro(null);
    setOcupadoId(area.id);
    try {
      await atualizarArea(area.id, { nome }, token);
      setEditandoId(null);
      avisarRapido(`Área renomeada para "${nome}"`);
      carregar();
    } catch (falha) {
      setErro(mensagemDeFalha(falha));
    } finally {
      setOcupadoId(null);
    }
  };

  const alternar = async (area: Area) => {
    setErro(null);
    setOcupadoId(area.id);
    try {
      await atualizarArea(area.id, { ativo: !area.ativo }, token);
      avisarRapido(area.ativo ? `"${area.nome}" desativada` : `"${area.nome}" reativada`);
      carregar();
    } catch (falha) {
      setErro(mensagemDeFalha(falha));
    } finally {
      setOcupadoId(null);
    }
  };

  // Ativas primeiro, em ordem alfabética com número natural ("Mesa 2" antes de "Mesa 10").
  const ordenadas = [...(areas ?? [])].sort(
    (a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })
  );

  return (
    <Cartao
      titulo="Áreas do restaurante"
      descricao="Cada mesa ou espaço que recebe um QR Code. Desativada, a área sai da tela de QR Codes e o código dela para de abrir o formulário; o histórico continua."
    >
      {erro && (
        <p role="alert" className="mb-4 rounded-xl bg-perigo-fundo px-3.5 py-3 text-sm font-semibold text-perigo">
          {erro}
        </p>
      )}

      {!areas ? (
        !erro && (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando áreas">
            {[0, 1, 2].map((i) => (
              <Esqueleto key={i} className="h-12" />
            ))}
          </div>
        )
      ) : (
        <>
          {ordenadas.length === 0 ? (
            <p className="mb-4 text-sm text-muted-foreground">
              Nenhuma área ainda. Cadastre as mesas e espaços para gerar os QR Codes.
            </p>
          ) : (
            <ul className="mb-4 -my-1 divide-y divide-[#efefea]">
              {ordenadas.map((area) => {
                const emEdicao = editandoId === area.id;
                const ocupado = ocupadoId === area.id;
                return (
                  <li key={area.id} className="flex items-center gap-2 py-2">
                    {emEdicao ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          salvarNome(area);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2"
                      >
                        <label htmlFor={`area-${area.id}`} className="sr-only">
                          Novo nome de {area.nome}
                        </label>
                        <input
                          id={`area-${area.id}`}
                          value={nomeEditado}
                          onChange={(e) => setNomeEditado(e.target.value)}
                          onKeyDown={(e) => e.key === 'Escape' && setEditandoId(null)}
                          autoFocus
                          className={campo}
                        />
                        <button
                          type="submit"
                          disabled={ocupado || !nomeEditado.trim()}
                          aria-label="Salvar o nome"
                          title="Salvar"
                          className={`${botaoDeIcone} text-primary`}
                        >
                          {ocupado ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-5" aria-hidden="true" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditandoId(null)}
                          aria-label="Cancelar"
                          title="Cancelar"
                          className={botaoDeIcone}
                        >
                          <X className="size-5" aria-hidden="true" />
                        </button>
                      </form>
                    ) : (
                      <>
                        <span className={`min-w-0 flex-1 font-semibold break-words ${area.ativo ? '' : 'text-muted-foreground'}`}>
                          {area.nome}
                          {!area.ativo && (
                            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                              Desativada
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditandoId(area.id);
                            setNomeEditado(area.nome);
                            setErro(null);
                          }}
                          aria-label={`Renomear ${area.nome}`}
                          title="Renomear"
                          className={botaoDeIcone}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => alternar(area)}
                          disabled={ocupado}
                          className={`h-9 flex-none rounded-lg px-2.5 text-sm font-bold transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                            area.ativo ? 'text-perigo hover:bg-perigo-fundo' : 'text-primary hover:bg-accent'
                          }`}
                        >
                          {ocupado ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : area.ativo ? 'Desativar' : 'Reativar'}
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <form onSubmit={adicionar} className="flex flex-wrap gap-2 border-t border-border pt-4">
            <label htmlFor="nova-area" className="sr-only">
              Nome da nova área
            </label>
            <input
              id="nova-area"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Nova área. Ex.: Mesa 15, Varanda"
              className={`${campo} flex-[1_1_12rem]`}
            />
            <button type="submit" disabled={criando || !novoNome.trim()} className={botaoPrimario}>
              {criando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
              Adicionar
            </button>
          </form>
        </>
      )}
    </Cartao>
  );
}

// ---------- Tempo de sessão ----------

const OPCOES_DE_DURACAO = [1, 2, 4, 8, 12, 24];
const DURACAO_PADRAO = 8;

function rotuloDeHoras(horas: number) {
  return horas === 1 ? '1 hora' : `${horas} horas`;
}

// Por quanto tempo um login vale. O backend confere a idade da sessão a cada
// requisição, então salvar vale na hora para todas as sessões abertas.
function SecaoTempoDeSessao({ token }: { token: string }) {
  const navigate = useNavigate();
  const [salvo, setSalvo] = useState<number | null>(null);
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    buscarConfiguracoes(token)
      .then((res) => {
        if (!ativo) return;
        setSalvo(res.duracaoSessaoHoras);
        setEscolhido(res.duracaoSessaoHoras);
      })
      .catch((e) => {
        if (ativo) setErro(mensagemDeFalha(e));
      });
    return () => {
      ativo = false;
    };
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

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (escolhido === null) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await salvarConfiguracoes({ duracaoSessaoHoras: escolhido }, token);
      if (vaiEncerrarAPropria) {
        encerrarSessao();
        deixarAvisoParaOLogin(`Tempo de sessão salvo em ${rotuloDeHoras(escolhido)}. Entre de novo para continuar.`);
        navigate(ROTA_DE_LOGIN, { replace: true });
        return;
      }
      setSalvo(res.duracaoSessaoHoras);
      avisarRapido(`Tempo de sessão: ${rotuloDeHoras(res.duracaoSessaoHoras)}. Já vale para todos.`);
    } catch (falha) {
      setErro(mensagemDeFalha(falha));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Cartao
      titulo="Tempo de sessão"
      descricao={'Por quanto tempo um login continua valendo. Quem não marca "Manter conectado" ao entrar sai antes, ao fechar o navegador.'}
    >
      {erro && (
        <p role="alert" className="mb-3 rounded-xl bg-perigo-fundo px-3.5 py-3 text-sm font-semibold text-perigo">
          {erro}
        </p>
      )}

      {salvo === null ? (
        !erro && <Esqueleto className="h-11" />
      ) : (
        <form onSubmit={salvar}>
          <div className="flex flex-wrap gap-2">
            <label htmlFor="duracao-sessao" className="sr-only">
              Tempo de sessão
            </label>
            <select
              id="duracao-sessao"
              value={escolhido ?? ''}
              onChange={(e) => setEscolhido(Number(e.target.value))}
              className={`${campo} flex-[1_1_10rem]`}
            >
              {opcoes.map((horas) => (
                <option key={horas} value={horas}>
                  {rotuloDeHoras(horas)}
                  {horas === DURACAO_PADRAO ? ' (padrão)' : ''}
                </option>
              ))}
            </select>
            <button type="submit" disabled={salvando || escolhido === salvo} className={botaoPrimario}>
              {salvando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Salvar
            </button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Vale na hora: encurtar encerra as sessões que já passaram do novo limite, e alongar estende as
            que ainda valem.
          </p>
          {vaiEncerrarAPropria && escolhido !== salvo && (
            <p role="status" className="mt-3 rounded-xl bg-[#fdf6ea] px-3.5 py-3 text-sm font-semibold text-[#5c3a07]">
              A sua sessão está aberta há mais de {rotuloDeHoras(escolhido!)}. Ao salvar, você vai precisar
              entrar de novo.
            </p>
          )}
        </form>
      )}
    </Cartao>
  );
}

// ---------- O que ainda não existe ----------

// Dizer o que falta e de que depende é mais honesto do que um controle que finge
// salvar, e deixa claro para a equipe o que vem depois.
function SecaoAindaNaoDisponivel() {
  const itens = [
    {
      titulo: 'Avisos por e-mail',
      texto: 'Os alertas de feedback novo chegam no sino do Echo. Por e-mail depende de um serviço de envio.',
    },
    {
      titulo: 'Retenção de dados (LGPD)',
      texto: 'Por quanto tempo os feedbacks ficam guardados. Depende da rotina que apaga o que passou do prazo.',
    },
  ];
  return (
    <Cartao titulo="Ainda não disponível" descricao="Previsto, mas depende de algo fora desta tela.">
      <ul className="flex flex-col gap-3">
        {itens.map((item) => (
          <li key={item.titulo} className="rounded-xl bg-[#f6f6f2] px-3.5 py-3">
            <p className="text-sm font-bold">{item.titulo}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{item.texto}</p>
          </li>
        ))}
      </ul>
    </Cartao>
  );
}
