import { useState } from 'react';
import { Download, Calendar, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Navigation } from '../Navigation';

const trendData = [
  { mes: 'Nov', higiene: 12, atendimento: 18, alimento: 8 },
  { mes: 'Dez', higiene: 15, atendimento: 22, alimento: 11 },
  { mes: 'Jan', higiene: 18, atendimento: 25, alimento: 14 },
  { mes: 'Fev', higiene: 14, atendimento: 20, alimento: 10 },
  { mes: 'Mar', higiene: 20, atendimento: 28, alimento: 15 },
  { mes: 'Abr', higiene: 22, atendimento: 30, alimento: 18 },
];

const sectorSummary = [
  { setor: 'Cozinha', total: 42, resolvidos: 35, pendentes: 7 },
  { setor: 'Salão', total: 38, resolvidos: 30, pendentes: 8 },
  { setor: 'Banheiro', total: 15, resolvidos: 10, pendentes: 5 },
  { setor: 'Entrada', total: 8, resolvidos: 6, pendentes: 2 },
];

export function Reports() {
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState('2026-04-24');

  return (
    <div className="min-h-screen bg-orange-50">
      <Navigation title="Relatórios Históricos" role="manager" />
      <div className="max-w-6xl mx-auto p-4 pb-8">
        <div className="pt-6 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Relatórios Históricos</h1>
          <p className="text-gray-600 mt-1">Análise de tendências e desempenho</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                Período Inicial
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Período Final
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div className="flex gap-3">
              <button className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors flex items-center gap-2">
                <Download className="w-5 h-5" />
                Exportar PDF
              </button>
              <button className="bg-white hover:bg-gray-50 text-orange-600 border-2 border-orange-600 px-6 py-3 rounded-xl font-semibold transition-colors flex items-center gap-2">
                <Download className="w-5 h-5" />
                Exportar CSV
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {sectorSummary.map((sector) => (
            <div key={sector.setor} className="bg-white rounded-xl shadow-md p-6">
              <h3 className="font-bold text-gray-900 mb-3">{sector.setor}</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total:</span>
                  <span className="font-semibold text-gray-900">{sector.total}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Resolvidos:</span>
                  <span className="font-semibold text-green-600">{sector.resolvidos}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Pendentes:</span>
                  <span className="font-semibold text-red-600">{sector.pendentes}</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Taxa de resolução</span>
                  <span className="font-semibold text-orange-600">
                    {((sector.resolvidos / sector.total) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="w-6 h-6 text-orange-600" />
            <h2 className="text-xl font-bold text-gray-900">Evolução de Feedbacks</h2>
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={trendData}>
              <XAxis dataKey="mes" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="higiene"
                stroke="#06b6d4"
                strokeWidth={2}
                name="Higiene"
              />
              <Line
                type="monotone"
                dataKey="atendimento"
                stroke="#8b5cf6"
                strokeWidth={2}
                name="Atendimento"
              />
              <Line
                type="monotone"
                dataKey="alimento"
                stroke="#f97316"
                strokeWidth={2}
                name="Alimento"
              />
            </LineChart>
          </ResponsiveContainer>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-cyan-50 rounded-xl p-4">
              <p className="text-sm text-gray-600 mb-1">Higiene</p>
              <p className="text-2xl font-bold text-cyan-600">+83%</p>
              <p className="text-xs text-gray-500 mt-1">vs. período anterior</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-4">
              <p className="text-sm text-gray-600 mb-1">Atendimento</p>
              <p className="text-2xl font-bold text-purple-600">+67%</p>
              <p className="text-xs text-gray-500 mt-1">vs. período anterior</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-4">
              <p className="text-sm text-gray-600 mb-1">Alimento</p>
              <p className="text-2xl font-bold text-orange-600">+125%</p>
              <p className="text-xs text-gray-500 mt-1">vs. período anterior</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
