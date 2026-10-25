import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import {
  aplicarRetencaoAgora,
  apagarDadosDoCliente,
  buscarConfiguracoes,
  buscarPreviaDaRetencao,
  salvarConfiguracoes,
  type Configuracoes,
  type ResultadoDaRetencao,
} from '../../services/api';
import { avisarRapido } from '../../avisoRapido';
import { contagemDaRetencao } from '../../descricaoDaAuditoria';
import { rotuloDePrazo } from '../../rotulos';
import { Cartao, Esqueleto } from '../layout/Pagina';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';

// Retenção de dados (LGPD) nas Configurações: os prazos, o que já passou deles e o
// pedido de um cliente para apagar os dados dele. A regra e a rodada automática estão
// na API (api/src/retencao.ts); aqui o administrador só ajusta e acompanha.

const campo =
  'h-11 w-full min-w-0 rounded-xl border border-borda-campo bg-input-background px-3.5 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const botaoPrimario =
  'inline-flex h-11 flex-none items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground transition-colors hover:bg-[#0a5242] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const botaoSecundario =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const botaoDePerigo =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-perigo px-4 font-semibold text-white transition-colors hover:bg-[#8c1d15] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

type Prazo = 'retencaoContatoDias' | 'retencaoComentarioDias' | 'retencaoNotificacaoDias';

// As opções de cada prazo. Ficam dentro das faixas que a API aceita (contato 30 a 365,
// comentário 30 a 1825, notificações 7 a 365); um valor salvo fora da lista (gravado
// pela API, por exemplo) aparece também.
const PRAZOS: { campo: Prazo; rotulo: string; ajuda: string; opcoes: number[]; padrao: number }[] = [
  {
    campo: 'retencaoContatoDias',
    rotulo: 'Nome e e-mail de quem pede resposta',
    ajuda: 'Tempo para a equipe responder o cliente. O texto das respostas enviadas sai junto. Contado da data do feedback.',
    opcoes: [30, 60, 90, 180, 365],
    padrao: 90,
  },
  {
    campo: 'retencaoComentarioDias',
    rotulo: 'Comentário',
    ajuda: 'Texto livre: pode trazer nome, telefone ou placa. Contado da data do feedback.',
    opcoes: [90, 180, 365, 730, 1825],
    padrao: 365,
  },
  {
    campo: 'retencaoNotificacaoDias',
    rotulo: 'Notificações',
    ajuda: 'Os alertas de feedback novo no sino. Contado da data do alerta.',
    opcoes: [30, 60, 90, 180, 365],
    padrao: 90,
  },
];


function quando(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function mensagemDeFalha(e: unknown) {
  const status = (e as { status?: number }).status;
  if (status === 403) return 'Só administradores podem mexer na retenção de dados.';
  return e instanceof Error && e.message ? e.message : 'Algo deu errado. Tente novamente.';
}

// Igual à checagem da API (retencao.routes.ts): tem cara de e-mail, sem espaço.
const PARECE_EMAIL = /^\S+@\S+$/;

type Confirmacao =
  | { tipo: 'aplicar'; contagem: string }
  | { tipo: 'cliente'; email: string };

export function SecaoRetencao({ token }: { token: string }) {
  const [configuracoes, setConfiguracoes] = useState<Configuracoes | null>(null);
  const [vencido, setVencido] = useState<ResultadoDaRetencao | null>(null);
  const [erroAoCarregar, setErroAoCarregar] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const [escolhidos, setEscolhidos] = useState<Record<Prazo, number> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroDosPrazos, setErroDosPrazos] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [resultadoDoCliente, setResultadoDoCliente] = useState<string | null>(null);
  const [erroDaAcao, setErroDaAcao] = useState<string | null>(null);

  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  // O foco volta ao botão que abriu a confirmação (como nos diálogos de Usuários).
  const quemAbriu = useRef<HTMLElement | null>(null);

  // Prazos e prévia juntos: a prévia depende dos prazos salvos, e os dois mudam a cada
  // salvar ou aplicar. Os seletores só voltam aos prazos salvos ao abrir e ao salvar:
  // depois de apagar algo, uma mudança ainda não salva neles continua lá.
  const carregar = async ({ redefinirPrazos }: { redefinirPrazos: boolean }) => {
    const [config, previa] = await Promise.all([buscarConfiguracoes(token), buscarPreviaDaRetencao(token)]);
    setConfiguracoes({ ...config, ultimaRetencaoEm: previa.ultimaRetencaoEm ?? config.ultimaRetencaoEm });
    setVencido(previa);
    if (!redefinirPrazos) return;
    setEscolhidos({
      retencaoContatoDias: config.retencaoContatoDias,
      retencaoComentarioDias: config.retencaoComentarioDias,
      retencaoNotificacaoDias: config.retencaoNotificacaoDias,
    });
  };

  useEffect(() => {
    let ativo = true;
    setErroAoCarregar(null);
    carregar({ redefinirPrazos: true }).catch((e) => ativo && setErroAoCarregar(mensagemDeFalha(e)));
    return () => {
      ativo = false;
    };
    // carregar só depende do token, que já está aqui.
  }, [token, tentativa]);

  // Depois de salvar ou apagar, a tela se recarrega. Se só o recarregar falhar, a ação
  // já foi feita: o erro de conexão sozinho faria parecer que não foi (e alguém repetiria).
  const recarregarDepoisDe = (feito: string, redefinirPrazos: boolean, aoFalhar: (m: string) => void) =>
    carregar({ redefinirPrazos }).catch(() =>
      aoFalhar(`${feito}, mas a tela não conseguiu se atualizar. Recarregue a página para ver como ficou.`)
    );

  const alterados = configuracoes && escolhidos
    ? PRAZOS.filter((p) => escolhidos[p.campo] !== configuracoes[p.campo])
    : [];
  const encurtou = configuracoes && escolhidos
    ? PRAZOS.some((p) => escolhidos[p.campo] < configuracoes[p.campo])
    : false;

  const salvarPrazos = async (e: FormEvent) => {
    e.preventDefault();
    if (!escolhidos || alterados.length === 0) return;
    setSalvando(true);
    setErroDosPrazos(null);
    try {
      await salvarConfiguracoes(
        Object.fromEntries(alterados.map((p) => [p.campo, escolhidos[p.campo]])),
        token
      );
    } catch (falha) {
      setErroDosPrazos(mensagemDeFalha(falha));
      setSalvando(false);
      return;
    }
    avisarRapido(
      encurtou
        ? 'Prazos salvos. O que já passou do novo prazo sai na próxima rodada, ou agora, em "Apagar agora".'
        : 'Prazos salvos.'
    );
    await recarregarDepoisDe('Prazos salvos', true, setErroDosPrazos);
    setSalvando(false);
  };

  const abrirConfirmacao = (nova: Confirmacao) => {
    quemAbriu.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setErroDaAcao(null);
    setConfirmacao(nova);
  };

  const confirmar = async () => {
    if (!confirmacao) return;
    setConfirmando(true);
    setErroDaAcao(null);
    let feito: string;
    try {
      if (confirmacao.tipo === 'aplicar') {
        const resultado = await aplicarRetencaoAgora(token);
        const apagado = contagemDaRetencao(resultado);
        avisarRapido(apagado ? `Apagado: ${apagado}.` : 'Nada tinha passado do prazo.');
        feito = apagado ? `Apagado: ${apagado}` : 'Nada tinha passado do prazo';
      } else {
        const { feedbacks } = await apagarDadosDoCliente(confirmacao.email, token);
        setResultadoDoCliente(
          feedbacks === 0
            ? `Nenhuma avaliação com o e-mail ${confirmacao.email}. Confira se é o mesmo e-mail que o cliente usou (maiúsculas não importam).`
            : `Pronto: o nome, o e-mail e o comentário de ${feedbacks === 1 ? '1 avaliação' : `${feedbacks} avaliações`} de ${confirmacao.email} foram apagados.`
        );
        if (feedbacks > 0) setEmail('');
        feito = 'Pedido atendido';
      }
    } catch (falha) {
      setErroDaAcao(mensagemDeFalha(falha));
      setConfirmacao(null);
      setConfirmando(false);
      return;
    }
    setConfirmacao(null);
    await recarregarDepoisDe(feito, false, setErroDaAcao);
    setConfirmando(false);
  };

  const contagemVencida = vencido ? contagemDaRetencao(vencido) : '';

  return (
    <Cartao
      titulo="Retenção de dados (LGPD)"
      descricao="Passado o prazo, o Echo apaga sozinho o que identifica o cliente, uma vez por dia em que é usado. O feedback fica: tipo, notas, área e data continuam nos painéis e relatórios."
    >
      {erroAoCarregar ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-perigo-fundo px-3.5 py-3 text-sm font-semibold text-perigo">
          <span className="min-w-0 flex-1">{erroAoCarregar}</span>
          <button type="button" onClick={() => setTentativa((t) => t + 1)} className={botaoSecundario}>
            Tentar de novo
          </button>
        </div>
      ) : !configuracoes || !escolhidos || !vencido ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando a retenção de dados">
          <Esqueleto className="h-11" />
          <Esqueleto className="h-11" />
          <Esqueleto className="h-11" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={salvarPrazos} className="flex min-w-0 flex-col gap-4" aria-labelledby="prazos-titulo">
            <h3 id="prazos-titulo" className="text-base font-bold">
              Por quanto tempo guardar
            </h3>
            {PRAZOS.map((p) => {
              const salvo = configuracoes[p.campo];
              const opcoes = p.opcoes.includes(salvo) ? p.opcoes : [...p.opcoes, salvo].sort((a, b) => a - b);
              return (
                <div key={p.campo} className="flex flex-col gap-1.5">
                  <label htmlFor={p.campo} className="text-sm font-semibold">
                    {p.rotulo}
                  </label>
                  <select
                    id={p.campo}
                    value={escolhidos[p.campo]}
                    onChange={(e) => setEscolhidos({ ...escolhidos, [p.campo]: Number(e.target.value) })}
                    aria-describedby={`${p.campo}-ajuda`}
                    className={campo}
                  >
                    {opcoes.map((dias) => (
                      <option key={dias} value={dias}>
                        {rotuloDePrazo(dias)}
                        {dias === p.padrao ? ' (padrão)' : ''}
                      </option>
                    ))}
                  </select>
                  <span id={`${p.campo}-ajuda`} className="text-[13px] text-muted-foreground">
                    {p.ajuda}
                  </span>
                </div>
              );
            })}

            {encurtou && (
              <p role="status" className="rounded-xl bg-[#fdf6ea] px-3.5 py-3 text-sm font-semibold text-[#5c3a07]">
                Encurtar um prazo apaga, na próxima rodada, o que já tiver passado dele. Não dá para desfazer.
              </p>
            )}
            {erroDosPrazos && (
              <p role="alert" className="rounded-xl bg-perigo-fundo px-3.5 py-3 text-sm font-semibold text-perigo">
                {erroDosPrazos}
              </p>
            )}
            <div>
              <button type="submit" disabled={salvando || alterados.length === 0} className={botaoPrimario}>
                {salvando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                Salvar prazos
              </button>
            </div>
          </form>

          <div className="flex min-w-0 flex-col gap-6">
            <section aria-labelledby="agora-titulo" className="flex flex-col gap-3">
              <h3 id="agora-titulo" className="text-base font-bold">
                O que já passou do prazo
              </h3>
              <p className="text-sm text-muted-foreground">
                {configuracoes.ultimaRetencaoEm
                  ? `Última vez que rodou: ${quando(configuracoes.ultimaRetencaoEm)}.`
                  : 'Ainda não rodou nenhuma vez.'}
              </p>
              {contagemVencida ? (
                <>
                  <p className="text-sm font-semibold">Pronto para sair: {contagemVencida}.</p>
                  <div>
                    <button
                      type="button"
                      onClick={() => abrirConfirmacao({ tipo: 'aplicar', contagem: contagemVencida })}
                      className={botaoSecundario}
                    >
                      Apagar agora
                    </button>
                  </div>
                </>
              ) : (
                <p className="flex items-center gap-2 text-sm font-semibold text-sucesso">
                  <ShieldCheck className="size-4 flex-none" aria-hidden="true" />
                  Nada passou do prazo.
                </p>
              )}
              {/* A conta (e o "Apagar agora") seguem os prazos salvos, não os seletores. */}
              {alterados.length > 0 && (
                <p className="text-[13px] text-muted-foreground">
                  Contado com os prazos salvos. Salve os novos para a conta mudar.
                </p>
              )}
            </section>

            <section aria-labelledby="cliente-titulo" className="flex flex-col gap-3 border-t border-border pt-5">
              <h3 id="cliente-titulo" className="text-base font-bold">
                Um cliente pediu para apagar os dados dele
              </h3>
              <p className="text-sm text-muted-foreground">
                A LGPD garante esse direito. Informe o e-mail que ele usou na avaliação: some o nome, o e-mail e o
                comentário de todas as avaliações com esse e-mail, na hora. O e-mail digitado aqui não fica guardado.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const limpo = email.trim();
                  if (PARECE_EMAIL.test(limpo)) abrirConfirmacao({ tipo: 'cliente', email: limpo });
                }}
                className="flex flex-wrap gap-2"
              >
                <label htmlFor="email-do-cliente" className="sr-only">
                  E-mail do cliente
                </label>
                <input
                  id="email-do-cliente"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setResultadoDoCliente(null);
                  }}
                  placeholder="E-mail do cliente"
                  className={`${campo} flex-[1_1_14rem]`}
                />
                <button type="submit" disabled={!PARECE_EMAIL.test(email.trim())} className={botaoSecundario}>
                  Apagar dados
                </button>
              </form>
              {resultadoDoCliente && (
                <p role="status" className="rounded-xl bg-[#f6f6f2] px-3.5 py-3 text-sm font-semibold">
                  {resultadoDoCliente}
                </p>
              )}
            </section>

            {erroDaAcao && (
              <p role="alert" className="rounded-xl bg-perigo-fundo px-3.5 py-3 text-sm font-semibold text-perigo">
                {erroDaAcao}
              </p>
            )}
          </div>
        </div>
      )}

      <Dialog open={confirmacao !== null} onOpenChange={(aberto) => !aberto && !confirmando && setConfirmacao(null)}>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-card p-6 sm:max-w-md"
          onCloseAutoFocus={(e) => {
            if (quemAbriu.current?.isConnected) {
              e.preventDefault();
              quemAbriu.current.focus();
            }
          }}
        >
          {confirmacao && (
            <ConteudoDaConfirmacao
              titulo={confirmacao.tipo === 'aplicar' ? 'Apagar agora o que passou do prazo?' : 'Apagar os dados deste cliente?'}
              acao={confirmacao.tipo === 'aplicar' ? 'Apagar agora' : 'Apagar dados'}
              confirmando={confirmando}
              aoConfirmar={confirmar}
              aoCancelar={() => setConfirmacao(null)}
            >
              {confirmacao.tipo === 'aplicar' ? (
                <>
                  Sai agora: {confirmacao.contagem}. Os feedbacks continuam nos painéis e relatórios, sem
                  identificação. Não dá para desfazer.
                </>
              ) : (
                <>
                  Some o nome, o e-mail e o comentário de todas as avaliações de{' '}
                  <strong className="break-all text-foreground">{confirmacao.email}</strong>. Os feedbacks continuam
                  nos painéis, sem identificação. Não dá para desfazer.
                </>
              )}
            </ConteudoDaConfirmacao>
          )}
        </DialogContent>
      </Dialog>
    </Cartao>
  );
}

function ConteudoDaConfirmacao({
  titulo,
  acao,
  confirmando,
  aoConfirmar,
  aoCancelar,
  children,
}: {
  titulo: string;
  acao: string;
  confirmando: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="pr-6">
        <DialogTitle className="text-xl font-extrabold">{titulo}</DialogTitle>
        <DialogDescription className="mt-1.5 text-sm">{children}</DialogDescription>
      </div>
      <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {/* O foco começa no "Cancelar": um Enter distraído não pode apagar dados. */}
        <button type="button" onClick={aoCancelar} disabled={confirmando} autoFocus className={botaoSecundario}>
          Cancelar
        </button>
        <button type="button" onClick={aoConfirmar} disabled={confirmando} className={botaoDePerigo}>
          {confirmando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {acao}
        </button>
      </div>
    </div>
  );
}
