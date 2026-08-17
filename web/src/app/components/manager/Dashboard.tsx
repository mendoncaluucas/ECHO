import { useNavigate } from 'react-router-dom';
import { MessageSquare, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Navigation } from '../Navigation';

const categoryData = [
  { name: 'Higiene', value: 35, color: '#06b6d4' },
  { name: 'Atendimento', value: 45, color: '#8b5cf6' },
  { name: 'Alimento', value: 20, color: '#f97316' },
];

const sectorData = [
  { setor: 'Cozinha', feedbacks: 42 },
  { setor: 'Salão', feedbacks: 38 },
  { setor: 'Banheiro', feedbacks: 15 },
  { setor: 'Entrada', feedbacks: 8 },
];

export function ManagerDashboard() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-orange-50">
      <Navigation title="Dashboard Gerencial" role="manager" />
      <div className="max-w-6xl mx-auto p-4 pb-8">
        <div className="pt-6 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Gerencial</h1>
          <p className="text-gray-600 mt-1">Visão geral dos feedbacks</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-2">
              <MessageSquare className="w-8 h-8 text-orange-600" />
              <span className="text-3xl font-bold text-gray-900">103</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Total de Feedbacks</p>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle className="w-8 h-8 text-green-600" />
              <span className="text-3xl font-bold text-gray-900">78%</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">% Resolvidos</p>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-2">
              <Clock className="w-8 h-8 text-blue-600" />
              <span className="text-3xl font-bold text-gray-900">2.4h</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Tempo Médio Resposta</p>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-8 h-8 text-purple-600" />
              <span className="text-3xl font-bold text-gray-900">+12%</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">vs. Mês Anterior</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Feedbacks por Categoria</h2>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Feedbacks por Setor</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={sectorData}>
                <XAxis dataKey="setor" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="feedbacks" fill="#f97316" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

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
      </div>
    </div>
  );
}
