import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Calendar, TrendingUp, Printer, Loader2 } from 'lucide-react';
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
import { buscarRelatorio, encerrarSessao, type RelatorioHistorico } from '../../services/api';
import { baixarCsv, decimal, montarCsv, type Celula } from '../../services/csv';

// Classes inteiras: o Tailwind só gera o que encontra escrito.
const ESTILO_CATEGORIA: Record<string, { cor: string; fundo: string; texto: string }> = {
  Higiene: { cor: '#06b6d4', fundo: 'bg-cyan-50', texto: 'text-cyan-700' },
  Atendimento: { cor: '#8b5cf6', fundo: 'bg-purple-50', texto: 'text-purple-700' },
  Alimento: { cor: '#f97316', fundo: 'bg-orange-50', texto: 'text-orange-700' },
};
const ESTILO_PADRAO = { cor: '#6b7280', fundo: 'bg-gray-50', texto: 'text-gray-700' };

// Mesmas cores do dashboard do gerente.
const SERIES_DE_VOLUME = [
  { chave: 'Feedbacks', cor: '#374151' },
  { chave: 'Elogios', cor: '#16a34a' },
  { chave: 'Sugestões', cor: '#d97706' },
  { chave: 'Reclamações', cor: '#dc2626' },
];

const campo =
  'w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500';

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

export function Reports() {
  const navigate = useNavigate();
  const [relatorio, setRelatorio] = useState<RelatorioHistorico | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [visao, setVisao] = useState<Visao>('nota');

  // Os campos de data e a consulta são separados. Campo vazio deixa a API escolher
  // (últimos 6 meses) e depois é preenchido com o período que ela devolveu, para a
  // tela mostrar o que está exibindo. Se a consulta seguisse os campos, esse
  // preenchimento dispararia a mesma busca de novo.
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [consulta, setConsulta] = useState<{ de?: string; ate?: string }>({});
  const requisicaoAtual = useRef(0);

  const problemaNoPeriodo = validarPeriodo(de, ate);

  useEffect(() => {
    const token = localStorage.getItem('echo_token');
    if (!token) {
      navigate('/gerente/login');
      return;
    }

    const minhaVez = ++requisicaoAtual.current;
    setCarregando(true);
    setErro(null);

    buscarRelatorio(token, consulta)
      .then((res) => {
        if (minhaVez !== requisicaoAtual.current) return;
        setRelatorio(res);
        setDe((atual) => atual || res.periodo.de);
        setAte((atual) => atual || res.periodo.ate);
      })
      .catch((e: Error & { status?: number }) => {
        if (minhaVez !== requisicaoAtual.current) return;
        if (e.status === 401) {
          encerrarSessao();
          navigate('/gerente/login');
          return;
        }
        setErro(e.message || 'Não foi possível carregar o relatório.');
      })
      .finally(() => {
        if (minhaVez === requisicaoAtual.current) setCarregando(false);
      });

    return () => {
      requisicaoAtual.current++;
    };
  }, [consulta, navigate]);

  const mudarPeriodo = (novoDe: string, novoAte: string) => {
    setDe(novoDe);
    setAte(novoAte);
    // Período inválido não vai para a API: a tela avisa e espera a correção.
    if (validarPeriodo(novoDe, novoAte)) return;
    setConsulta({ de: novoDe, ate: novoAte });
  };

  const exportarCsv = () => {
    if (!relatorio) return;
    const { de: inicio, ate: fim } = relatorio.periodo;
    baixarCsv(`relatorio-${inicio}-a-${fim}.csv`, csvDoRelatorio(relatorio));
  };

  const dadosDoGrafico =
    relatorio?.meses.map((m) =>
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
    ) ?? [];

  // Exportar só o que a tela mostra para os campos preenchidos: com o período inválido
  // ou o novo ainda carregando, o que está embaixo é o período anterior.
  const exportavel = relatorio !== null && !carregando && !problemaNoPeriodo;

  const series =
    visao === 'nota'
      ? (relatorio?.porCategoria ?? []).map((c) => ({
          chave: c.categoria,
          cor: (ESTILO_CATEGORIA[c.categoria] ?? ESTILO_PADRAO).cor,
        }))
      : SERIES_DE_VOLUME;

  return (
    <div className="print:bg-white">
      <div className="max-w-6xl mx-auto p-4 pb-8">
        <div className="pt-6 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Relatórios Históricos</h1>
          <p className="text-gray-600 mt-1">
            <span className="print:hidden">Análise de tendências e desempenho</span>
            {relatorio && (
              <span className="hidden print:inline">
                Restaurante Sinuelo · {dataBr(relatorio.periodo.de)} a{' '}
                {dataBr(relatorio.periodo.ate)}
              </span>
            )}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 print:hidden">
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                Período Inicial
              </label>
              <input
                type="date"
                value={de}
                onChange={(e) => mudarPeriodo(e.target.value, ate)}
                className={campo}
              />
            </div>

            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Período Final
              </label>
              <input
                type="date"
                value={ate}
                onChange={(e) => mudarPeriodo(de, e.target.value)}
                className={campo}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {/* O PDF sai pela impressão do navegador ("Salvar como PDF"). A página
                  tem estilo de impressão próprio: some a navegação e os controles. */}
              <button
                onClick={() => window.print()}
                disabled={!exportavel}
                className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Printer className="w-5 h-5" />
                Imprimir / PDF
              </button>
              <button
                onClick={exportarCsv}
                disabled={!exportavel}
                className="bg-white hover:bg-gray-50 text-orange-600 border-2 border-orange-600 px-6 py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Download className="w-5 h-5" />
                Exportar CSV
              </button>
            </div>
          </div>

          {problemaNoPeriodo && (
            <p className="mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              {problemaNoPeriodo} Os números abaixo ainda são do período anterior.
            </p>
          )}
        </div>

        {erro && (
          <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {erro}
          </p>
        )}

        {carregando && !relatorio ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
          </div>
        ) : relatorio ? (
          <div className={carregando ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            {/* No papel a largura fica abaixo do `md`; as colunas de impressão são fixas. */}
            <div className="grid grid-cols-2 md:grid-cols-4 print:grid-cols-4 gap-4 mb-6">
              {[
                { rotulo: 'Feedbacks', valor: relatorio.resumo.total, classe: 'text-gray-900' },
                {
                  rotulo: 'Resolvidos',
                  valor: `${relatorio.resumo.percentualResolvido}%`,
                  classe: 'text-green-600',
                },
                {
                  rotulo: 'Em andamento',
                  valor: relatorio.resumo.emAndamento,
                  classe: 'text-amber-600',
                },
                { rotulo: 'Pendentes', valor: relatorio.resumo.pendentes, classe: 'text-red-600' },
              ].map((item) => (
                <div key={item.rotulo} className="bg-white rounded-xl shadow-md p-5">
                  <p className="text-sm text-gray-600">{item.rotulo}</p>
                  <p className={`text-2xl font-bold mt-1 ${item.classe}`}>{item.valor}</p>
                </div>
              ))}
            </div>

            <h2 className="text-lg font-bold text-gray-900 mb-3">Por setor</h2>
            {relatorio.porArea.length === 0 ? (
              <p className="bg-white rounded-xl shadow-md p-6 mb-6 text-gray-600">
                Nenhum feedback no período.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 print:grid-cols-3 gap-4 mb-6">
                {relatorio.porArea.map((setor) => (
                  <div key={setor.area} className="bg-white rounded-xl shadow-md p-6 break-inside-avoid">
                    <h3 className="font-bold text-gray-900 mb-3">{setor.area}</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total:</span>
                        <span className="font-semibold text-gray-900">{setor.total}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Resolvidos:</span>
                        <span className="font-semibold text-green-600">{setor.resolvidos}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Em andamento:</span>
                        <span className="font-semibold text-amber-600">{setor.emAndamento}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Pendentes:</span>
                        <span className="font-semibold text-red-600">{setor.pendentes}</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between text-xs">
                      <span className="text-gray-500">Taxa de resolução</span>
                      <span className="font-semibold text-orange-600">
                        {setor.percentualResolvido}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-lg p-6 break-inside-avoid">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-6 h-6 text-orange-600" />
                  <h2 className="text-xl font-bold text-gray-900">
                    {visao === 'nota' ? 'Nota média por categoria' : 'Feedbacks por mês'}
                  </h2>
                </div>
                <div className="flex gap-2 print:hidden">
                  {(
                    [
                      ['nota', 'Nota média'],
                      ['volume', 'Quantidade'],
                    ] as const
                  ).map(([valor, rotulo]) => (
                    <button
                      key={valor}
                      onClick={() => setVisao(valor)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                        visao === valor
                          ? 'bg-orange-600 text-white'
                          : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                      }`}
                    >
                      {rotulo}
                    </button>
                  ))}
                </div>
              </div>

              {/* `grafico-imprimivel`: regras de impressão em styles/index.css. */}
              <div className="grafico-imprimivel">
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={dadosDoGrafico}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="mes" />
                    <YAxis
                      allowDecimals={visao === 'nota'}
                      domain={visao === 'nota' ? [0, 5] : [0, 'auto']}
                      ticks={visao === 'nota' ? [0, 1, 2, 3, 4, 5] : undefined}
                    />
                    <Tooltip
                      formatter={(valor) =>
                        visao === 'nota' && typeof valor === 'number' ? estrelas(valor) : valor
                      }
                    />
                    <Legend />
                    {series.map((serie) => (
                      <Line
                        key={serie.chave}
                        type="monotone"
                        // Função, não o nome: o Recharts lê dataKey em texto como caminho,
                        // e uma categoria com ponto no nome sumiria do gráfico.
                        dataKey={(linha: Record<string, unknown>) => linha[serie.chave]}
                        name={serie.chave}
                        stroke={serie.cor}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        // Mês sem avaliação fica como buraco na linha da nota: ligar os
                        // vizinhos inventaria uma tendência que não foi medida.
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {visao === 'nota' && (
                <p className="text-xs text-gray-500 mt-2">
                  Mês sem avaliação aparece como intervalo na linha.
                </p>
              )}

              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 print:grid-cols-3 gap-4">
                {relatorio.porCategoria.map((c) => {
                  const estilo = ESTILO_CATEGORIA[c.categoria] ?? ESTILO_PADRAO;
                  const variacao =
                    c.mediaEstrelas !== null && c.mediaAnterior !== null
                      ? Math.round((c.mediaEstrelas - c.mediaAnterior) * 10) / 10
                      : null;

                  return (
                    <div key={c.categoria} className={`${estilo.fundo} rounded-xl p-4`}>
                      <p className="text-sm text-gray-600 mb-1">
                        {c.categoria} · {c.avaliacoes}{' '}
                        {c.avaliacoes === 1 ? 'avaliação' : 'avaliações'}
                      </p>
                      <p className={`text-2xl font-bold ${estilo.texto}`}>
                        {estrelas(c.mediaEstrelas)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {c.mediaEstrelas === null ? (
                          'Sem avaliação no período'
                        ) : variacao === null ? (
                          'Sem base de comparação no período anterior'
                        ) : (
                          <>
                            <span
                              className={
                                variacao > 0
                                  ? 'font-semibold text-green-600'
                                  : variacao < 0
                                    ? 'font-semibold text-red-600'
                                    : 'font-semibold text-gray-600'
                              }
                            >
                              {variacao > 0 ? '+' : ''}
                              {umaCasa(variacao)}★
                            </span>{' '}
                            vs. período anterior ({estrelas(c.mediaAnterior)})
                          </>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
