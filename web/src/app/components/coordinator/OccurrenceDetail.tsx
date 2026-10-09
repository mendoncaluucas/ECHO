import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Loader2, Mail, SearchX, Send, Star, UserCheck } from 'lucide-react';
import {
  atualizarStatusOcorrencia,
  buscarOcorrencia,
  tokenDaSessao,
  type Ocorrencia,
  type StatusOcorrencia,
} from '../../services/api';
import { corDoTipo, haQuanto, ROTULO_STATUS, rotuloDoStatus, rotuloDoTipo, seloDoStatus } from '../../rotulos';
import { avisarRapido } from '../../avisoRapido';
import { AvisoDeErro, CabecalhoDaPagina, Cartao, Esqueleto, EstadoVazio, Pagina } from '../layout/Pagina';

const OPCOES_DE_STATUS: { valor: StatusOcorrencia; descricao: string }[] = [
  { valor: 'PENDENTE', descricao: 'Ninguém começou a tratar ainda' },
  { valor: 'EM_ANDAMENTO', descricao: 'Alguém já está cuidando disso' },
  { valor: 'RESOLVIDO', descricao: 'Tratada, não precisa de mais nada' },
];

// Para o aviso depois de salvar: "Ocorrência marcada como resolvida".
const NO_FEMININO: Record<StatusOcorrencia, string> = {
  PENDENTE: 'pendente',
  EM_ANDAMENTO: 'em andamento',
  RESOLVIDO: 'resolvida',
};

const ROTA_DA_LISTA = '/coordenador/ocorrencias';

function dataEHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Estrelas({ quantidade }: { quantidade: number }) {
  return (
    <span role="img" aria-label={`${quantidade} de 5 estrelas`} className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={`size-5 ${i <= quantidade ? 'fill-estrela text-estrela' : 'text-[#d6d6cf]'}`}
        />
      ))}
    </span>
  );
}

// Quem pediu resposta deixou nome e e-mail. Só o detalhe recebe o contato da API
// (nunca as listas), porque é daqui que alguém vai responder.
function ContatoDoCliente({
  contato,
  area,
  criadoEm,
}: {
  contato: { nome: string | null; email: string };
  area: string | null;
  criadoEm: string;
}) {
  const [copiado, setCopiado] = useState(false);

  const assunto = 'Sobre a sua avaliação no Restaurante Sinuelo';
  const corpo =
    `Olá${contato.nome ? `, ${contato.nome}` : ''}!\n\n` +
    `Recebemos a avaliação que você deixou em ${new Date(criadoEm).toLocaleDateString('pt-BR')}` +
    `${area ? ` (${area})` : ''}.\n\n`;
  // O endereço vai codificado (menos o @): um e-mail antigo com "?cc=..." viraria cópia
  // para outra pessoa na resposta. A API já recusa esses endereços; isto cobre o que
  // tiver sido gravado antes.
  const destinatario = contato.email.split('@').map(encodeURIComponent).join('@');
  const link = `mailto:${destinatario}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;

  // Para quem usa e-mail no navegador (Gmail, Outlook web): o mailto: costuma não
  // abrir nada nesses casos, e copiar resolve.
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(contato.email);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de área de transferência: o e-mail continua visível na tela.
    }
  };

  return (
    <section aria-label="Contato do cliente" className="min-w-0 rounded-2xl border border-[#cfe5dc] bg-accent p-5 sm:p-6">
      <p className="flex items-center gap-2 text-sm font-bold text-accent-foreground">
        <Mail className="size-4" aria-hidden="true" />
        O cliente pediu resposta
      </p>
      {/* E-mail na própria linha: ao lado do nome, no celular, quebrava no meio ("example.c / om"). */}
      {contato.nome && <p className="mt-2 font-semibold">{contato.nome}</p>}
      <p className={`${contato.nome ? '' : 'mt-2 '}[overflow-wrap:anywhere]`}>{contato.email}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={link}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[#0a5242] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Send className="size-4" aria-hidden="true" />
          Responder por e-mail
        </a>
        <button
          type="button"
          onClick={copiar}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#cfe5dc] bg-card px-4 text-sm font-semibold text-accent-foreground transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {copiado ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          <span aria-live="polite">{copiado ? 'Copiado' : 'Copiar e-mail'}</span>
        </button>
      </div>
    </section>
  );
}

export function OccurrenceDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const token = tokenDaSessao() ?? '';
  const [ocorrencia, setOcorrencia] = useState<Ocorrencia | null>(null);
  const [escolhido, setEscolhido] = useState<StatusOcorrencia>('PENDENTE');
  const [carregando, setCarregando] = useState(true);
  const [naoEncontrada, setNaoEncontrada] = useState(false);
  const [erroAoCarregar, setErroAoCarregar] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroAoSalvar, setErroAoSalvar] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  // A ocorrência abre do painel, do registro, do log e das notificações. Volta de onde
  // veio; link aberto direto, sem histórico, cai na lista.
  const voltarParaOrigem = () => {
    const temDeOndeVoltar = (window.history.state?.idx ?? 0) > 0;
    if (temDeOndeVoltar) navigate(-1);
    else navigate(ROTA_DA_LISTA);
  };

  // Sessão vencida (401) é tratada no serviço da API, que leva ao login.
  useEffect(() => {
    if (!id) return;
    let ativo = true;
    setCarregando(true);
    setErroAoCarregar(null);

    buscarOcorrencia(id, token)
      .then((res) => {
        if (!ativo) return;
        setOcorrencia(res);
        setEscolhido(res.status);
      })
      .catch((e: Error & { status?: number }) => {
        if (!ativo) return;
        if (e.status === 404) setNaoEncontrada(true);
        else setErroAoCarregar(e.message || 'Não foi possível carregar a ocorrência.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [id, token, tentativa]);

  const salvar = async () => {
    if (!id || !ocorrencia) return;
    setErroAoSalvar(null);
    setSalvando(true);
    try {
      await atualizarStatusOcorrencia(id, escolhido, token);
      // Volta para a tela de onde veio (em geral a fila de pendentes), e o aviso
      // confirma lá: quem trata uma atrás da outra não precisa de um clique a mais.
      avisarRapido(`Ocorrência marcada como ${NO_FEMININO[escolhido]}`);
      voltarParaOrigem();
    } catch (e) {
      setErroAoSalvar(e instanceof Error && e.message ? e.message : 'Não foi possível salvar.');
      setSalvando(false);
    }
  };

  const voltar = (
    <button
      type="button"
      onClick={voltarParaOrigem}
      className="-ml-1 mb-4 inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm font-bold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Voltar
    </button>
  );

  if (naoEncontrada) {
    return (
      <Pagina>
        {voltar}
        <EstadoVazio
          icone={SearchX}
          titulo="Ocorrência não encontrada"
          descricao="O endereço pode estar errado, ou a ocorrência foi apagada."
        >
          <button
            type="button"
            onClick={() => navigate(ROTA_DA_LISTA)}
            className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-[#0a5242]"
          >
            Ver as ocorrências
          </button>
        </EstadoVazio>
      </Pagina>
    );
  }

  if (erroAoCarregar) {
    return (
      <Pagina>
        {voltar}
        <AvisoDeErro mensagem={erroAoCarregar} aoTentarDeNovo={() => setTentativa((t) => t + 1)} />
      </Pagina>
    );
  }

  if (carregando || !ocorrencia) {
    return (
      <Pagina>
        {voltar}
        <div aria-busy="true" aria-label="Carregando a ocorrência">
          <Esqueleto className="mb-6 h-16 w-72 max-w-full" />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Esqueleto className="h-64 rounded-2xl" />
            <Esqueleto className="h-64 rounded-2xl" />
          </div>
        </div>
      </Pagina>
    );
  }

  const o = ocorrencia;
  const mudou = escolhido !== o.status;

  return (
    <Pagina>
      {voltar}

      <CabecalhoDaPagina
        sobretitulo={
          <>
            {o.area?.nome ?? 'Restaurante'} · <time dateTime={o.criadoEm}>{dataEHora(o.criadoEm)}</time>
          </>
        }
        titulo={
          <span className="inline-flex items-center gap-3">
            <span className={`size-3 flex-none rounded-full ${corDoTipo(o.tipo)}`} aria-hidden="true" />
            {rotuloDoTipo(o.tipo)}
          </span>
        }
        acoes={
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${seloDoStatus(o.status)}`}>
            {rotuloDoStatus(o.status)}
          </span>
        }
      />

      {/* Duas colunas só em tela larga: com o menu lateral aberto num notebook, um terço
          da largura espremia a tratativa em colunas de duas palavras. Numa coluna só, a
          tratativa vem logo depois das notas (antes do contato): é o que o coordenador
          veio fazer, e no celular ficava no fim da página. A última linha (1fr) absorve
          a sobra quando a tratativa é mais alta que os cartões ao lado. */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:grid-rows-[auto_auto_1fr]">
        <Cartao titulo="O que o cliente escreveu" className="xl:col-start-1">
          {o.comentario ? (
            <p className="text-lg leading-relaxed break-words whitespace-pre-line">“{o.comentario}”</p>
          ) : (
            <p className="text-muted-foreground italic">O cliente não escreveu comentário, só deu as notas.</p>
          )}
        </Cartao>

        <Cartao titulo="Notas por categoria" className="xl:col-start-1">
          {o.avaliacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem notas.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {o.avaliacoes.map((a) => (
                <li key={a.categoria} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span className="font-semibold">{a.categoria}</span>
                  <span className="flex items-center gap-2">
                    <Estrelas quantidade={a.estrelas} />
                    <span className="w-4 text-right text-sm font-bold tabular-nums">{a.estrelas}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <div className="order-last min-w-0 xl:order-none xl:col-start-1">
          {o.contato ? (
            <ContatoDoCliente contato={o.contato} area={o.area?.nome ?? null} criadoEm={o.criadoEm} />
          ) : (
            <p className="px-1 text-sm text-muted-foreground">
              Avaliação anônima: o cliente não deixou contato para resposta.
            </p>
          )}
        </div>

        <div className="min-w-0 xl:sticky xl:top-6 xl:col-start-2 xl:row-span-3 xl:row-start-1">
          <Cartao titulo="Tratativa" descricao="Em que pé está esta ocorrência">
            <fieldset>
              <legend className="sr-only">Situação da ocorrência</legend>
              <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                {OPCOES_DE_STATUS.map((opcao) => {
                  const marcada = escolhido === opcao.valor;
                  return (
                    <label
                      key={opcao.valor}
                      className={`flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-[background-color,border-color] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring ${
                        marcada ? 'border-primary bg-accent' : 'border-border hover:bg-[#f6f6f2]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="situacao"
                        value={opcao.valor}
                        checked={marcada}
                        onChange={() => setEscolhido(opcao.valor)}
                        className="mt-0.5 size-4 flex-none accent-primary"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold">
                          {ROTULO_STATUS[opcao.valor]}
                          {opcao.valor === o.status && (
                            <span className="font-semibold text-muted-foreground"> · atual</span>
                          )}
                        </span>
                        <span className="block text-sm text-muted-foreground">{opcao.descricao}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {erroAoSalvar && (
              <p role="alert" className="mt-4 rounded-xl bg-perigo-fundo px-3.5 py-3 text-sm font-semibold text-perigo">
                {erroAoSalvar}
              </p>
            )}

            <button
              type="button"
              onClick={salvar}
              disabled={!mudou || salvando}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground transition-colors hover:bg-[#0a5242] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {salvando && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
              {salvando
                ? 'Salvando…'
                : mudou
                  ? `Marcar como ${NO_FEMININO[escolhido]}`
                  : 'Escolha uma nova situação'}
            </button>

            {o.tratadoPor && (
              <p className="mt-4 flex items-start gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
                <UserCheck className="mt-0.5 size-4 flex-none" aria-hidden="true" />
                <span>
                  Última mudança: <strong className="text-foreground">{o.tratadoPor.nome}</strong>
                  {o.tratadoEm && (
                    <>
                      {' · '}
                      <time dateTime={o.tratadoEm} title={dataEHora(o.tratadoEm)}>
                        {haQuanto(o.tratadoEm)}
                      </time>
                    </>
                  )}
                </span>
              </p>
            )}
          </Cartao>
        </div>
      </div>
    </Pagina>
  );
}
