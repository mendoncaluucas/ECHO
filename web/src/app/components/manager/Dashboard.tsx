import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Inbox, TrendingDown, TrendingUp } from 'lucide-react';
import {
  buscarMetricas,
  listarOcorrencias,
  tokenDaSessao,
  usuarioLogado,
  type Metricas,
  type Ocorrencia,
} from '../../services/api';
import { corDoTipo, numeroBr, primeiroNome, rotuloDoTipo, saudacao } from '../../rotulos';
import {
  AvisoDeErro,
  Barra,
  CabecalhoDaPagina,
  Cartao,
  Esqueleto,
  EstadoVazio,
  Indicador,
  LinkDoCartao,
  Pagina,
  Segmentado,
} from '../layout/Pagina';
import { ItemDaOcorrencia } from '../coordinator/ItemDaOcorrencia';

const PERIODOS = [7, 30, 90].map((dias) => ({ valor: dias, rotulo: `${dias} dias` }));
const PERIODO_PADRAO = 30;

// Abaixo disto a categoria ganha o aviso "precisa de atenção" e a barra em âmbar.
const NOTA_DE_ATENCAO = 3;

// Mais que isto vira uma lista comprida demais para um painel; o resto está nos relatórios.
const LIMITE_DE_AREAS = 6;

const ROTA_DAS_OCORRENCIAS = '/coordenador/ocorrencias';

// Os tipos do front são cópia manual do contrato: um campo renomeado no backend
// chegaria aqui como undefined e o `.map` derrubaria a tela. Melhor barrar na entrada.
function respostaCompleta(m: Metricas | null): m is Metricas {
  return (
    m != null &&
    m.resumo != null &&
    typeof m.resumo.total === 'number' &&
    Array.isArray(m.porStatus) &&
    Array.isArray(m.porTipo) &&
    Array.isArray(m.porArea) &&
    Array.isArray(m.porCategoria)
  );
}

// O que não depende do período: as últimas que chegaram e quantas esperam tratativa
// (o mesmo número do menu lateral, de qualquer data).
type Recentes = { itens: Ocorrencia[]; pendentes: number };

export function ManagerDashboard() {
  const token = tokenDaSessao() ?? '';
  // O período fica no endereço (?dias=7): quem abre uma ocorrência e volta continua
  // no período que escolheu, e recarregar a página não o perde.
  const [busca, setBusca] = useSearchParams();
  const pedido = Number(busca.get('dias'));
  const dias = PERIODOS.some((p) => p.valor === pedido) ? pedido : PERIODO_PADRAO;
  const setDias = (novo: number) =>
    setBusca(novo === PERIODO_PADRAO ? {} : { dias: String(novo) }, { replace: true });
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [buscando, setBuscando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [recentes, setRecentes] = useState<Recentes | null>(null);
  const [erroNasRecentes, setErroNasRecentes] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  // Sessão vencida (401) é tratada no serviço da API, que leva ao login. Aqui só o
  // que é desta tela.
  useEffect(() => {
    let ativo = true;
    setBuscando(true);
    setErro(null);

    buscarMetricas(dias, token)
      .then((res) => {
        if (!ativo) return;
        if (respostaCompleta(res)) setMetricas(res);
        else setErro('A API respondeu em um formato que esta versão da tela não reconhece.');
      })
      .catch((e: Error) => {
        if (ativo) setErro(e.message || 'Não foi possível carregar os indicadores.');
      })
      .finally(() => {
        if (ativo) setBuscando(false);
      });

    return () => {
      ativo = false;
    };
  }, [dias, token, tentativa]);

  useEffect(() => {
    let ativo = true;
    setErroNasRecentes(false);

    Promise.all([
      listarOcorrencias(token, { porPagina: 5 }),
      listarOcorrencias(token, { status: 'PENDENTE', porPagina: 1 }),
    ])
      .then(([ultimas, pendentes]) => {
        if (ativo) setRecentes({ itens: ultimas.itens, pendentes: pendentes.total });
      })
      .catch(() => {
        if (ativo) setErroNasRecentes(true);
      });

    return () => {
      ativo = false;
    };
  }, [token, tentativa]);

  return (
    <Pagina>
      <CabecalhoDaPagina
        sobretitulo={`Últimos ${dias} dias`}
        titulo={`${saudacao()}, ${primeiroNome(usuarioLogado()?.nome)}`}
        acoes={<Segmentado rotulo="Período" opcoes={PERIODOS} valor={dias} aoMudar={setDias} />}
      />

      {erro ? (
        <AvisoDeErro mensagem={erro} aoTentarDeNovo={() => setTentativa((t) => t + 1)} />
      ) : !metricas ? (
        <EsqueletoDoPainel />
      ) : (
        // Ao trocar o período, os números antigos ficam (esmaecidos) até os novos
        // chegarem: a tela não pisca nem pula.
        <div
          aria-busy={buscando}
          className={`flex flex-col gap-4 transition-opacity ${buscando ? 'opacity-60' : ''}`}
        >
          <Conteudo
            metricas={metricas}
            dias={dias}
            recentes={recentes}
            erroNasRecentes={erroNasRecentes}
            aoVerNoventaDias={() => setDias(90)}
          />
        </div>
      )}
    </Pagina>
  );
}

function Conteudo({
  metricas,
  dias,
  recentes,
  erroNasRecentes,
  aoVerNoventaDias,
}: {
  metricas: Metricas;
  dias: number;
  recentes: Recentes | null;
  erroNasRecentes: boolean;
  aoVerNoventaDias: () => void;
}) {
  const { resumo, porTipo, porArea, porCategoria } = metricas;
  const vazio = resumo.total === 0;
  const variacao = resumo.variacaoPercentual;
  const IconeDaVariacao = variacao !== null && variacao < 0 ? TrendingDown : TrendingUp;

  return (
    <>
      {vazio && (
        <EstadoVazio
          icone={Inbox}
          titulo={`Nenhum feedback nos últimos ${dias} dias`}
          descricao="Quando um cliente avaliar pelo QR Code da mesa, os números aparecem aqui."
        >
          {dias < 90 && (
            <button
              type="button"
              onClick={aoVerNoventaDias}
              className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-[#0a5242]"
            >
              Ver os últimos 90 dias
            </button>
          )}
        </EstadoVazio>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Indicador rotulo="Feedbacks" valor={resumo.total}>
          {variacao === null ? (
            'Sem período anterior para comparar'
          ) : variacao === 0 ? (
            `Igual aos ${dias} dias antes`
          ) : (
            <span className="inline-flex items-center gap-1">
              <IconeDaVariacao className="size-3.5 flex-none" aria-hidden="true" />
              {variacao > 0 ? '+' : ''}
              {numeroBr(variacao)}% vs. {dias} dias antes
            </span>
          )}
        </Indicador>

        <Indicador rotulo="Resolvidos" valor={`${numeroBr(resumo.percentualResolvido, 0)}%`}>
          <Barra percentual={resumo.percentualResolvido} />
          <p className="mt-2">
            {resumo.resolvidos} de {resumo.total}
          </p>
        </Indicador>

        <Indicador
          rotulo="Tempo médio de tratativa"
          // "—" e não "0 h": ninguém tratado ainda é ausência de dado, não agilidade.
          valor={
            resumo.tempoMedioTratativaHoras === null
              ? '—'
              : `${numeroBr(resumo.tempoMedioTratativaHoras)} h`
          }
        >
          {resumo.tempoMedioTratativaHoras === null
            ? 'Nenhuma tratada no período'
            : 'Da chegada até a tratativa'}
        </Indicador>

        <Indicador
          rotulo="Aguardando tratativa"
          valor={recentes ? recentes.pendentes : erroNasRecentes ? '—' : <Esqueleto className="h-9 w-12" />}
          tom={recentes && recentes.pendentes > 0 ? 'perigo' : 'normal'}
          para={ROTA_DAS_OCORRENCIAS}
        >
          {recentes && recentes.pendentes === 0 ? (
            <span className="inline-flex items-center gap-1 text-sucesso">
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              Nada pendente
            </span>
          ) : (
            // O cabeçalho fala em "últimos N dias"; este número não: é o mesmo do menu.
            <span className="inline-flex items-center gap-0.5 text-primary">
              De todas as datas
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </span>
          )}
        </Indicador>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Cartao
          titulo="Nota média por categoria"
          descricao="De 1 a 5 estrelas, no período"
          className="lg:col-span-2"
        >
          {porCategoria.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma categoria avaliada no período.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {porCategoria.map((c) => {
                const atencao = c.mediaEstrelas < NOTA_DE_ATENCAO;
                return (
                  <li key={c.categoria}>
                    <div className="flex items-baseline justify-between gap-3 text-sm font-semibold">
                      <span className="min-w-0 truncate">{c.categoria}</span>
                      <span className={`flex-none tabular-nums ${atencao ? 'text-atencao' : ''}`}>
                        {numeroBr(c.mediaEstrelas)}
                      </span>
                    </div>
                    <div className="mt-2">
                      <Barra
                        percentual={(c.mediaEstrelas / 5) * 100}
                        cor={atencao ? 'bg-atencao-barra' : 'bg-primary'}
                        grossa
                      />
                    </div>
                    {/* O aviso fica embaixo: ao lado da nota, espremia o nome da categoria. */}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.total} {c.total === 1 ? 'avaliação' : 'avaliações'}
                      {atencao && (
                        <span className="font-bold text-atencao"> · precisa de atenção</span>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>

        <Cartao
          titulo="Chegaram agora"
          descricao="As últimas, de qualquer data"
          // A tela de ocorrências abre nas pendentes; "Ver todas" pede todas mesmo.
          acao={<LinkDoCartao para={`${ROTA_DAS_OCORRENCIAS}?status=todas`}>Ver todas</LinkDoCartao>}
          className="lg:col-span-3"
        >
          <UltimasOcorrencias recentes={recentes} erro={erroNasRecentes} />
        </Cartao>
      </div>

      {!vazio && (
        <div className="grid gap-4 md:grid-cols-2">
          <Cartao titulo="Por tipo" descricao="Feedbacks no período">
            <ul className="flex flex-col gap-4">
              {porTipo.map((t) => {
                const percentual = resumo.total ? (t.total / resumo.total) * 100 : 0;
                return (
                  <li key={t.tipo}>
                    <div className="flex items-baseline justify-between gap-3 text-sm font-semibold">
                      <span className="inline-flex items-center gap-2">
                        <span className={`size-2.5 rounded-full ${corDoTipo(t.tipo)}`} aria-hidden="true" />
                        {rotuloDoTipo(t.tipo)}
                      </span>
                      <span className="tabular-nums">
                        {t.total}
                        <span className="ml-1.5 font-medium text-muted-foreground">
                          {numeroBr(percentual, 0)}%
                        </span>
                      </span>
                    </div>
                    <div className="mt-2">
                      <Barra percentual={percentual} cor={corDoTipo(t.tipo)} grossa />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Cartao>

          <Cartao
            titulo="Por área"
            descricao={
              porArea.length > LIMITE_DE_AREAS
                ? `As ${LIMITE_DE_AREAS} com mais feedbacks (de ${porArea.length})`
                : 'Onde os feedbacks foram dados'
            }
            acao={<LinkDoCartao para="/gerente/relatorios">Relatórios</LinkDoCartao>}
          >
            <PorArea areas={porArea} />
          </Cartao>
        </div>
      )}
    </>
  );
}

function PorArea({ areas }: { areas: Metricas['porArea'] }) {
  // A API já devolve da área mais movimentada para a menos.
  const visiveis = areas.slice(0, LIMITE_DE_AREAS);
  const maior = Math.max(1, ...visiveis.map((a) => a.total));
  return (
    <ul className="flex flex-col gap-3.5">
      {visiveis.map((a) => (
        <li key={a.area}>
          <div className="flex items-baseline justify-between gap-3 text-sm font-semibold">
            <span className="min-w-0 truncate">{a.area}</span>
            <span className="flex-none tabular-nums">{a.total}</span>
          </div>
          <div className="mt-1.5">
            <Barra percentual={(a.total / maior) * 100} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function UltimasOcorrencias({ recentes, erro }: { recentes: Recentes | null; erro: boolean }) {
  if (erro) {
    return <p className="text-sm text-muted-foreground">Não foi possível carregar as últimas ocorrências.</p>;
  }
  if (!recentes) {
    return (
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <Esqueleto key={i} className="h-16" />
        ))}
      </div>
    );
  }
  if (recentes.itens.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma ocorrência ainda.</p>;
  }

  return (
    <ul className="-my-1 divide-y divide-[#efefea]">
      {recentes.itens.map((o) => (
        <li key={o.id}>
          <ItemDaOcorrencia ocorrencia={o} />
        </li>
      ))}
    </ul>
  );
}

function EsqueletoDoPainel() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando o painel">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Esqueleto key={i} className="h-[124px] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Esqueleto className="h-80 rounded-2xl lg:col-span-2" />
        <Esqueleto className="h-80 rounded-2xl lg:col-span-3" />
      </div>
    </div>
  );
}
