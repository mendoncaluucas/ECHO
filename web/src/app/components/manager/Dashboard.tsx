import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Loader2,
  Inbox,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Navigation } from '../Navigation';
import {
  buscarMetricas,
  type Metricas,
  type StatusOcorrencia,
  type TipoFeedback,
} from '../../services/api';

const PERIODOS = [7, 30, 90];

// Classes inteiras: o Tailwind varre o código por strings completas e não gera
// nada montado em tempo de execução.
const CONFIG_STATUS: Record<StatusOcorrencia, { rotulo: string; classe: string }> = {
  PENDENTE: { rotulo: 'Pendente', classe: 'bg-gray-100 text-gray-700' },
  EM_ANDAMENTO: { rotulo: 'Em andamento', classe: 'bg-blue-100 text-blue-700' },
  RESOLVIDO: { rotulo: 'Resolvido', classe: 'bg-green-100 text-green-700' },
};

const ROTULO_TIPO: Record<TipoFeedback, string> = {
  ELOGIO: 'Elogio',
  SUGESTAO: 'Sugestão',
  RECLAMACAO: 'Reclamação',
};

// Cores dos gráficos vão em hex porque o Recharts pinta via SVG, não via classe.
const COR_TIPO: Record<TipoFeedback, string> = {
  ELOGIO: '#16a34a',
  SUGESTAO: '#d97706',
  RECLAMACAO: '#dc2626',
};

// Usados se a API devolver um valor que o front ainda não conhece — o enum do
// backend pode crescer antes de um deploy do front.
const STATUS_DESCONHECIDO = { rotulo: 'Desconhecido', classe: 'bg-gray-100 text-gray-700' };
const COR_DESCONHECIDA = '#9ca3af';

// Quantas áreas cabem no gráfico antes de virar um paredão de barras finas sem
// rótulo legível. A API já devolve ordenado da mais movimentada para a menos.
const LIMITE_DE_AREAS = 10;

const numero = (valor: number) =>
  valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

// Os tipos do front são cópia manual do contrato e o CI não roda typecheck no web,
// então um campo renomeado no backend chegaria aqui como undefined e o `.map` abaixo
// derrubaria a aplicação inteira — não há error boundary. Melhor barrar na entrada e
// mostrar mensagem do que servir tela branca ou número errado.
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

export function ManagerDashboard() {
  const navigate = useNavigate();
  const [dias, setDias] = useState(30);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('echo_token');
    if (!token) {
      navigate('/gerente/login');
      return;
    }

    let ativo = true;
    setCarregando(true);
    setErro(null);

    buscarMetricas(dias, token)
      .then((res) => {
        if (!ativo) return;
        if (!respostaCompleta(res)) {
          setErro('A API respondeu em um formato que esta versão da tela não reconhece.');
          return;
        }
        setMetricas(res);
      })
      .catch((e: Error & { status?: number }) => {
        if (!ativo) return;
        if (e.status === 401) {
          localStorage.removeItem('echo_token');
          navigate('/gerente/login');
          return;
        }
        setErro(e.message || 'Não foi possível carregar os indicadores.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [dias, navigate]);

  const seletorDePeriodo = (
    <div className="flex gap-2">
      {PERIODOS.map((opcao) => (
        <button
          key={opcao}
          onClick={() => setDias(opcao)}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            dias === opcao
              ? 'bg-orange-600 text-white shadow-md'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {opcao} dias
        </button>
      ))}
    </div>
  );

  const acoes = (
    <div className="flex gap-4">
      <button
        onClick={() => navigate('/gerente/registro')}
        className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-4 px-6 rounded-xl font-semibold transition-colors shadow-md hover:shadow-lg"
      >
        Ver Registro Completo
      </button>
      <button
        onClick={() => navigate('/gerente/relatorios')}
        className="flex-1 bg-white hover:bg-gray-50 text-orange-600 border-2 border-orange-600 py-4 px-6 rounded-xl font-semibold transition-colors"
      >
        Relatórios Históricos
      </button>
    </div>
  );

  const moldura = (conteudo: React.ReactNode) => (
    <div className="min-h-screen bg-orange-50">
      <Navigation title="Dashboard Gerencial" role="manager" />
      <div className="max-w-6xl mx-auto p-4 pb-8">
        <div className="pt-6 pb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard Gerencial</h1>
            <p className="text-gray-600 mt-1">Feedbacks dos últimos {dias} dias</p>
          </div>
          {seletorDePeriodo}
        </div>
        {conteudo}
      </div>
    </div>
  );

  if (carregando) {
    return moldura(
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
      </div>
    );
  }

  if (erro || !metricas) {
    return moldura(
      <p className="bg-white rounded-2xl shadow-lg p-6 text-gray-700">
        {erro ?? 'Não foi possível carregar os indicadores.'}
      </p>
    );
  }

  const { resumo, porStatus, porTipo, porArea, porCategoria } = metricas;

  if (resumo.total === 0) {
    return moldura(
      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-lg p-10 text-center space-y-3">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
            <Inbox className="w-8 h-8 text-orange-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">
            Nenhum feedback nos últimos {dias} dias
          </h2>
          <p className="text-gray-600">Escolha um período maior para ver os indicadores.</p>
        </div>
        {acoes}
      </div>
    );
  }

  const variacao = resumo.variacaoPercentual;
  const caiu = variacao !== null && variacao < 0;
  const IconeVariacao = caiu ? TrendingDown : TrendingUp;

  const areasNoGrafico = porArea.slice(0, LIMITE_DE_AREAS);
  const areasOcultas = porArea.length - areasNoGrafico.length;

  const dadosTipo = porTipo.map((item) => ({
    nome: ROTULO_TIPO[item.tipo] ?? item.tipo,
    total: item.total,
    cor: COR_TIPO[item.tipo] ?? COR_DESCONHECIDA,
  }));

  return moldura(
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between mb-2">
            <MessageSquare className="w-8 h-8 text-orange-600" />
            <span className="text-3xl font-bold text-gray-900">{resumo.total}</span>
          </div>
          <p className="text-sm text-gray-600 font-medium">Total de Feedbacks</p>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-8 h-8 text-green-600" />
            <span className="text-3xl font-bold text-gray-900">
              {resumo.percentualResolvido}%
            </span>
          </div>
          <p className="text-sm text-gray-600 font-medium">
            Resolvidos ({resumo.resolvidos} de {resumo.total})
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-8 h-8 text-blue-600" />
            <span className="text-3xl font-bold text-gray-900">
              {/* "—" e não "0h": ninguém tratado ainda é ausência de dado, não agilidade. */}
              {resumo.tempoMedioTratativaHoras === null
                ? '—'
                : `${numero(resumo.tempoMedioTratativaHoras)}h`}
            </span>
          </div>
          <p className="text-sm text-gray-600 font-medium">Tempo Médio de Tratativa</p>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between mb-2">
            <IconeVariacao
              className={`w-8 h-8 ${caiu ? 'text-red-600' : 'text-purple-600'}`}
            />
            <span className="text-3xl font-bold text-gray-900">
              {variacao === null ? '—' : `${variacao > 0 ? '+' : ''}${variacao}%`}
            </span>
          </div>
          <p className="text-sm text-gray-600 font-medium">
            {variacao === null
              ? 'Sem período anterior para comparar'
              : `vs. ${dias} dias anteriores`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        {porStatus.map((item) => {
          const config = CONFIG_STATUS[item.status] ?? STATUS_DESCONHECIDO;
          return (
            <span
              key={item.status}
              className={`px-4 py-2 rounded-full text-sm font-semibold ${config.classe}`}
            >
              {config.rotulo}: {item.total}
            </span>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Feedbacks por Tipo</h2>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={dadosTipo}
                cx="50%"
                cy="50%"
                labelLine={false}
                // Só o percentual: com o nome junto, o rótulo estoura o SVG no
                // celular e sai cortado. O nome está na legenda logo abaixo.
                // Fatia zerada não ganha rótulo, senão fica um "0%" solto no gráfico.
                label={({ percent }) => (percent ? `${(percent * 100).toFixed(0)}%` : '')}
                outerRadius={80}
                dataKey="total"
                nameKey="nome"
              >
                {dadosTipo.map((item) => (
                  <Cell key={item.nome} fill={item.cor} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          {/* Legenda própria: mostra também os tipos com zero, que somem do gráfico. */}
          <div className="flex flex-wrap justify-center gap-4 mt-2">
            {dadosTipo.map((item) => (
              <span key={item.nome} className="flex items-center gap-2 text-sm text-gray-600">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.cor }}
                />
                {item.nome}: <strong className="text-gray-900">{item.total}</strong>
              </span>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Feedbacks por Setor</h2>
          <p className="text-sm text-gray-600 mb-4">
            {areasOcultas > 0
              ? `As ${LIMITE_DE_AREAS} áreas com mais feedbacks (outras ${areasOcultas} não aparecem).`
              : 'Todas as áreas com feedback no período.'}
          </p>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={areasNoGrafico}>
              <XAxis dataKey="area" />
              <YAxis allowDecimals={false} />
              <Tooltip formatter={(valor) => [valor, 'Feedbacks']} />
              <Bar dataKey="total" fill="#f97316" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Média de Estrelas por Categoria</h2>
        <p className="text-sm text-gray-600 mb-4">
          Categorias que ninguém avaliou no período não aparecem.
        </p>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={porCategoria}>
            <XAxis dataKey="categoria" />
            <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} />
            <Tooltip
              formatter={(valor, _nome, item) => [
                `${numero(Number(valor))} ★ · ${item?.payload?.total ?? 0} avaliações`,
                'Média',
              ]}
            />
            <Bar dataKey="mediaEstrelas" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {acoes}
    </>
  );
}
