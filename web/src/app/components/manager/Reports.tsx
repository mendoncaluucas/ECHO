import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Inbox, Printer, TrendingDown, TrendingUp } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts';
import { buscarRelatorio, tokenDaSessao, type RelatorioHistorico } from '../../services/api';
import { baixarCsv, decimal, montarCsv, type Celula } from '../../services/csv';
import {
  AvisoDeErro,
  Barra,
  CabecalhoDaPagina,
  Cartao,
  Esqueleto,
  EstadoVazio,
  Indicador,
  Pagina,
  Segmentado,
} from '../layout/Pagina';

// Cores das linhas de nota, na ordem das categorias (a API devolve em ordem
// alfabética). Em hex porque o Recharts pinta via SVG, não via classe. Diferem também
// na claridade, para quem não distingue as cores.
const CORES_DAS_CATEGORIAS = ['#0f6e5a', '#2e63b8', '#a8590a', '#7a3fa0', '#c2342a', '#16181d'];

// As mesmas cores de tipo do resto do sistema (theme.css).
const SERIES_DE_VOLUME = [
  { chave: 'Feedbacks', cor: '#16181d' },
  { chave: 'Elogios', cor: '#067647' },
  { chave: 'Sugestões', cor: '#2e63b8' },
  { chave: 'Reclamações', cor: '#c2342a' },
];

type Visao = 'nota' | 'volume';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// "2026-05" → "mai/26". Tabela fixa: o toLocaleDateString muda a pontuação de um
// navegador para outro ("mai. de 26", "mai de 26").
function rotuloDoMes(mes: string) {
  const [ano, numero] = mes.split('-');
  return `${MESES[Number(numero) - 1] ?? numero}/${ano.slice(2)}`;
}

function dataBr(dia: string) {
  const [ano, mes, d] = dia.split('-');
  return `${d}/${mes}/${ano}`;
}

// Sempre uma casa: "4★" ao lado de "4,4★" parece outra escala.
function umaCasa(valor: number) {
  return valor.toFixed(1).replace('.', ',');
}

function estrelas(valor: number | null) {
  return valor === null ? '—' : `${umaCasa(valor)}★`;
}

// Mesmo teto da API. Checar aqui evita a consulta e, principalmente, evita que a tela
// mostre os campos com um período e os números (e o CSV) de outro, o anterior.
const MESES_MAXIMO = 24;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function validarPeriodo(de: string, ate: string): string | null {
  if (de === '' || ate === '') return null;
  if (de > ate) return 'A data inicial precisa ser anterior à final.';

  const [anoDe, mesDe] = de.split('-').map(Number);
  const [anoAte, mesAte] = ate.split('-').map(Number);
  if ((anoAte - anoDe) * 12 + (mesAte - mesDe) + 1 > MESES_MAXIMO) {
    return `O período pode ter no máximo ${MESES_MAXIMO} meses.`;
  }
  return null;
}

// "AAAA-MM-DD" no fuso de quem está usando, que é o do restaurante.
function diaLocal(data: Date) {
  const doisDigitos = (n: number) => String(n).padStart(2, '0');
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
}

// Atalhos de período com a mesma regra do padrão da API: do primeiro dia do mês,
// N-1 meses atrás, até hoje. "6 meses" é exatamente o que a tela abre mostrando.
function periodoDeMeses(meses: number) {
  const hoje = new Date();
  return {
    de: diaLocal(new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1), 1)),
    ate: diaLocal(hoje),
  };
}
const ATALHOS = [3, 6, 12];

function csvDoRelatorio(r: RelatorioHistorico) {
  const categorias = r.porCategoria.map((c) => c.categoria);
  const linhas: Celula[][] = [
    [`Relatório Echo — ${dataBr(r.periodo.de)} a ${dataBr(r.periodo.ate)}`],
    [],
    ['Por mês'],
    [
      'Mês',
      'Feedbacks',
      'Elogios',
      'Sugestões',
      'Reclamações',
      ...categorias.map((c) => `Nota média ${c}`),
    ],
    ...r.meses.map((m) => [
      m.mes,
      m.total,
      m.porTipo.ELOGIO,
      m.porTipo.SUGESTAO,
      m.porTipo.RECLAMACAO,
      ...categorias.map((nome) =>
        decimal(m.categorias.find((c) => c.categoria === nome)?.mediaEstrelas)
      ),
    ]),
    [],
    ['Por setor'],
    ['Setor', 'Total', 'Pendentes', 'Em andamento', 'Resolvidos', 'Taxa de resolução (%)'],
    ...r.porArea.map((a) => [
      a.area,
      a.total,
      a.pendentes,
      a.emAndamento,
      a.resolvidos,
      a.percentualResolvido,
    ]),
    [],
    ['Por categoria'],
    ['Categoria', 'Avaliações', 'Nota média', 'Nota média no período anterior'],
    ...r.porCategoria.map((c) => [
      c.categoria,
      c.avaliacoes,
      decimal(c.mediaEstrelas),
      decimal(c.mediaAnterior),
    ]),
  ];
  return montarCsv(linhas);
}

const botaoSecundario =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const campoDeData =
  'h-10 w-full min-w-0 rounded-lg border border-border bg-input-background px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function Reports() {
  const token = tokenDaSessao() ?? '';

  // O período consultado fica no endereço (?de=&ate=): recarregar ou mandar o link
  // mostra o mesmo relatório. Sem ele, a API escolhe os últimos 6 meses.
  const [parametros, setParametros] = useSearchParams();
  // O período do endereço vale só como par válido. Invertido, acima de 24 meses ou
  // pela metade (link antigo, editado à mão), é ignorado e a tela mostra o padrão:
  // antes, invertido deixava a tela carregando para sempre, e só com "de" a API
  // recusava o intervalo num erro que "Tentar de novo" não resolvia.
  const deNoEndereco = parametros.get('de') ?? '';
  const ateNoEndereco = parametros.get('ate') ?? '';
  const periodoDoEnderecoVale =
    DATA.test(deNoEndereco) && DATA.test(ateNoEndereco) && !validarPeriodo(deNoEndereco, ateNoEndereco);
  const deConsultado = periodoDoEnderecoVale ? deNoEndereco : '';
  const ateConsultado = periodoDoEnderecoVale ? ateNoEndereco : '';
  const enderecoIgnorado = (deNoEndereco !== '' || ateNoEndereco !== '') && !periodoDoEnderecoVale;
  // Tira do endereço o período ignorado, para a barra não mostrar um que não vale.
  useEffect(() => {
    if (enderecoIgnorado) setParametros({}, { replace: true });
  }, [enderecoIgnorado, setParametros]);

  // Os campos e a consulta são separados: um período inválido fica nos campos, com o
  // aviso, sem ir para a API nem para o endereço. Campo vazio é preenchido com o
  // período que a API devolveu, para a tela mostrar o que está exibindo.
  const [de, setDe] = useState(deConsultado);
  const [ate, setAte] = useState(ateConsultado);
  // O "Relatórios" do menu limpa o endereço na mesma tela; os campos acompanham.
  useEffect(() => {
    setDe(deConsultado);
    setAte(ateConsultado);
  }, [deConsultado, ateConsultado]);

  const [relatorio, setRelatorio] = useState<RelatorioHistorico | null>(null);
  const [buscando, setBuscando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [visao, setVisao] = useState<Visao>('nota');
  const [tentativa, setTentativa] = useState(0);
  const pedidoAtual = useRef(0);

  const problemaNoPeriodo = validarPeriodo(de, ate);

  // Sessão vencida (401) é tratada no serviço da API, que leva ao login.
  useEffect(() => {
    const meu = ++pedidoAtual.current;
    setBuscando(true);
    setErro(null);

    buscarRelatorio(token, {
      ...(deConsultado && { de: deConsultado }),
      ...(ateConsultado && { ate: ateConsultado }),
    })
      .then((res) => {
        if (meu !== pedidoAtual.current) return;
        setRelatorio(res);
        setDe((atual) => atual || res.periodo.de);
        setAte((atual) => atual || res.periodo.ate);
      })
      .catch((e: Error) => {
        if (meu === pedidoAtual.current) setErro(e.message || 'Não foi possível carregar o relatório.');
      })
      .finally(() => {
        if (meu === pedidoAtual.current) setBuscando(false);
      });
  }, [token, deConsultado, ateConsultado, tentativa]);

  const mudarPeriodo = (novoDe: string, novoAte: string) => {
    setDe(novoDe);
    setAte(novoAte);
    // Período inválido ou pela metade não vai para a API: a tela avisa e espera.
    if (!novoDe || !novoAte || validarPeriodo(novoDe, novoAte)) return;
    setParametros({ de: novoDe, ate: novoAte }, { replace: true });
  };

  const atalhoAtual = ATALHOS.find((meses) => {
    const p = periodoDeMeses(meses);
    return p.de === de && p.ate === ate;
  });

  const exportarCsv = () => {
    if (!relatorio) return;
    const { de: inicio, ate: fim } = relatorio.periodo;
    baixarCsv(`relatorio-${inicio}-a-${fim}.csv`, csvDoRelatorio(relatorio));
  };

  // Exportar e imprimir só o que a tela mostra para os campos preenchidos: com o
  // período inválido ou o novo ainda carregando, o que está embaixo é o anterior.
  const exportavel = relatorio !== null && !buscando && !problemaNoPeriodo;

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo="Relatórios"
        descricao={
          <>
            <span className="print:hidden">Como as notas e o volume de feedbacks mudaram mês a mês.</span>
            {relatorio && (
              <span className="hidden print:inline">
                Restaurante Sinuelo · {dataBr(relatorio.periodo.de)} a {dataBr(relatorio.periodo.ate)}
              </span>
            )}
          </>
        }
        acoes={
          <div className="flex flex-wrap gap-2 print:hidden">
            {/* O PDF sai pela impressão do navegador ("Salvar como PDF"). A página tem
                estilo de impressão próprio: somem o menu e os controles. */}
            <button type="button" onClick={() => window.print()} disabled={!exportavel} className={botaoSecundario}>
              <Printer className="size-4" aria-hidden="true" />
              Imprimir / PDF
            </button>
            <button type="button" onClick={exportarCsv} disabled={!exportavel} className={botaoSecundario}>
              <Download className="size-4" aria-hidden="true" />
              Exportar CSV
            </button>
          </div>
        }
      />

      <Cartao className="mb-4 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <div role="group" aria-label="Atalhos de período" className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
            {ATALHOS.map((meses) => {
              const escolhido = atalhoAtual === meses;
              return (
                <button
                  key={meses}
                  type="button"
                  aria-pressed={escolhido}
                  onClick={() => {
                    const p = periodoDeMeses(meses);
                    mudarPeriodo(p.de, p.ate);
                  }}
                  className={`h-9 rounded-[9px] px-3.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    escolhido
                      ? 'bg-card font-bold text-foreground shadow-sm'
                      : 'font-semibold text-[#3a3f4a] hover:text-foreground'
                  }`}
                >
                  {meses} meses
                </button>
              );
            })}
          </div>
          {/* Linha própria no celular: dividindo a linha com os atalhos, os campos
              encolhiam até sumir. */}
          <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:max-w-md sm:min-w-80 sm:flex-1">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-bold text-muted-foreground">De</span>
              <input
                type="date"
                value={de}
                onChange={(e) => mudarPeriodo(e.target.value, ate)}
                className={campoDeData}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-bold text-muted-foreground">Até</span>
              <input
                type="date"
                value={ate}
                onChange={(e) => mudarPeriodo(de, e.target.value)}
                className={campoDeData}
              />
            </label>
          </div>
        </div>

        {problemaNoPeriodo && (
          <p role="alert" className="mt-3 text-sm font-semibold text-perigo">
            {problemaNoPeriodo}
            {relatorio && ' Os números abaixo ainda são do período anterior.'}
          </p>
        )}
      </Cartao>

      {erro ? (
        <AvisoDeErro mensagem={erro} aoTentarDeNovo={() => setTentativa((t) => t + 1)} />
      ) : !relatorio ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando o relatório">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Esqueleto key={i} className="h-[108px] rounded-2xl" />
            ))}
          </div>
          <Esqueleto className="h-96 rounded-2xl" />
        </div>
      ) : (
        <div
          aria-busy={buscando}
          className={`flex flex-col gap-4 transition-opacity ${buscando ? 'opacity-60' : ''}`}
        >
          <Conteudo relatorio={relatorio} visao={visao} aoMudarVisao={setVisao} />
        </div>
      )}
    </Pagina>
  );
}

function Conteudo({
  relatorio: r,
  visao,
  aoMudarVisao,
}: {
  relatorio: RelatorioHistorico;
  visao: Visao;
  aoMudarVisao: (v: Visao) => void;
}) {
  const { resumo } = r;

  if (resumo.total === 0) {
    return (
      <EstadoVazio
        icone={Inbox}
        titulo="Nenhum feedback no período"
        descricao="Escolha um período maior ou outras datas."
      />
    );
  }

  const corDaCategoria = (nome: string) =>
    CORES_DAS_CATEGORIAS[r.porCategoria.findIndex((c) => c.categoria === nome) % CORES_DAS_CATEGORIAS.length] ??
    CORES_DAS_CATEGORIAS[0];

  const dadosDoGrafico = r.meses.map((m) =>
    visao === 'nota'
      ? {
          mes: rotuloDoMes(m.mes),
          ...Object.fromEntries(m.categorias.map((c) => [c.categoria, c.mediaEstrelas])),
        }
      : {
          mes: rotuloDoMes(m.mes),
          Feedbacks: m.total,
          Elogios: m.porTipo.ELOGIO,
          Sugestões: m.porTipo.SUGESTAO,
          Reclamações: m.porTipo.RECLAMACAO,
        }
  );

  const series =
    visao === 'nota'
      ? r.porCategoria.map((c) => ({ chave: c.categoria, cor: corDaCategoria(c.categoria) }))
      : SERIES_DE_VOLUME;

  return (
    <>
      {/* No papel a largura fica abaixo do `lg`; as colunas de impressão são fixas. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 print:grid-cols-4">
        <Indicador rotulo="Feedbacks" valor={resumo.total} />
        <Indicador rotulo="Resolvidos" valor={`${resumo.percentualResolvido}%`}>
          <Barra percentual={resumo.percentualResolvido} />
          <p className="mt-2">
            {resumo.resolvidos} de {resumo.total}
          </p>
        </Indicador>
        <Indicador rotulo="Em andamento" valor={resumo.emAndamento} />
        <Indicador rotulo="Pendentes" valor={resumo.pendentes} tom={resumo.pendentes > 0 ? 'perigo' : 'normal'} />
      </div>

      <Cartao
        titulo={visao === 'nota' ? 'Nota média por categoria, mês a mês' : 'Feedbacks por mês'}
        descricao={visao === 'nota' ? 'Mês sem avaliação aparece como intervalo na linha.' : undefined}
        acao={
          <div className="print:hidden">
            <Segmentado
              rotulo="O que mostrar no gráfico"
              opcoes={[
                { valor: 'nota', rotulo: 'Nota' },
                { valor: 'volume', rotulo: 'Quantidade' },
              ]}
              valor={visao}
              aoMudar={aoMudarVisao}
            />
          </div>
        }
        className="break-inside-avoid"
      >
        {/* `grafico-imprimivel`: regras de impressão em styles/index.css. */}
        <div className="grafico-imprimivel -ml-3 text-xs">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={dadosDoGrafico} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ecece7" vertical={false} />
              <XAxis dataKey="mes" tick={{ fill: '#5b6170' }} tickLine={false} axisLine={{ stroke: '#e6e6e0' }} />
              <YAxis
                width={36}
                allowDecimals={visao === 'nota'}
                domain={visao === 'nota' ? [0, 5] : [0, 'auto']}
                ticks={visao === 'nota' ? [0, 1, 2, 3, 4, 5] : undefined}
                tick={{ fill: '#5b6170' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(valor) => (visao === 'nota' && typeof valor === 'number' ? estrelas(valor) : valor)}
                contentStyle={{ borderRadius: 12, borderColor: '#e6e6e0', fontSize: 13 }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
              {series.map((serie) => (
                <Line
                  key={serie.chave}
                  type="monotone"
                  // Função, não o nome: o Recharts lê dataKey em texto como caminho, e
                  // uma categoria com ponto no nome sumiria do gráfico.
                  dataKey={(linha: Record<string, unknown>) => linha[serie.chave]}
                  name={serie.chave}
                  stroke={serie.cor}
                  strokeWidth={2.5}
                  dot={{ r: 3, strokeWidth: 0, fill: serie.cor }}
                  activeDot={{ r: 5 }}
                  // Mês sem avaliação fica como buraco na linha da nota: ligar os
                  // vizinhos inventaria uma tendência que não foi medida.
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Cartao>

      <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
        <Cartao titulo="Nota por categoria" descricao="No período, comparada com o período anterior de mesmo tamanho" className="break-inside-avoid">
          <ul className="flex flex-col gap-4">
            {r.porCategoria.map((c) => {
              const variacao =
                c.mediaEstrelas !== null && c.mediaAnterior !== null
                  ? Math.round((c.mediaEstrelas - c.mediaAnterior) * 10) / 10
                  : null;
              const Seta = variacao !== null && variacao < 0 ? TrendingDown : TrendingUp;
              return (
                <li key={c.categoria}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="inline-flex min-w-0 items-center gap-2 font-semibold">
                      <span
                        className="size-2.5 flex-none rounded-full"
                        style={{ backgroundColor: corDaCategoria(c.categoria) }}
                        aria-hidden="true"
                      />
                      <span className="truncate">{c.categoria}</span>
                    </span>
                    <span className="flex-none text-lg font-extrabold tabular-nums">{estrelas(c.mediaEstrelas)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.avaliacoes} {c.avaliacoes === 1 ? 'avaliação' : 'avaliações'}
                    {' · '}
                    {c.mediaEstrelas === null ? (
                      'sem avaliação no período'
                    ) : variacao === null ? (
                      'sem base no período anterior'
                    ) : variacao === 0 ? (
                      `igual ao período anterior (${estrelas(c.mediaAnterior)})`
                    ) : (
                      <span className={`inline-flex items-center gap-1 font-bold ${variacao > 0 ? 'text-sucesso' : 'text-perigo'}`}>
                        <Seta className="size-3.5" aria-hidden="true" />
                        {variacao > 0 ? '+' : ''}
                        {umaCasa(variacao)}★ vs. {estrelas(c.mediaAnterior)} antes
                      </span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        </Cartao>

        <Cartao titulo="Por área" descricao="Quanto do que chegou em cada área já foi resolvido" className="break-inside-avoid">
          {r.porArea.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum feedback no período.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {r.porArea.map((a) => (
                <li key={a.area} className="break-inside-avoid">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-semibold">{a.area}</span>
                    <span className="flex-none tabular-nums">
                      <span className="font-bold">{a.percentualResolvido}%</span>
                      <span className="text-muted-foreground"> resolvidos</span>
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <Barra percentual={a.percentualResolvido} grossa />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {a.total} {a.total === 1 ? 'feedback' : 'feedbacks'} · {a.pendentes}{' '}
                    {a.pendentes === 1 ? 'pendente' : 'pendentes'} · {a.emAndamento} em andamento
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </>
  );
}
