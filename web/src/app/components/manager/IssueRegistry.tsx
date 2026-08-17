import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Download, Eye } from 'lucide-react';
import { Navigation } from '../Navigation';

type Status = 'aberto' | 'em_andamento' | 'resolvido';

const mockIssues = [
  {
    id: 1,
    data: '2026-04-24',
    categoria: 'Higiene',
    setor: 'Banheiro',
    descricao: 'Papel higiênico acabando e torneira pingando...',
    status: 'aberto' as Status,
  },
  {
    id: 2,
    data: '2026-04-24',
    categoria: 'Atendimento',
    setor: 'Salão',
    descricao: 'Garçom muito atencioso, parabéns!',
    status: 'em_andamento' as Status,
  },
  {
    id: 3,
    data: '2026-04-23',
    categoria: 'Alimento',
    setor: 'Cozinha',
    descricao: 'Comida estava fria quando chegou na mesa...',
    status: 'resolvido' as Status,
  },
  {
    id: 4,
    data: '2026-04-23',
    categoria: 'Higiene',
    setor: 'Salão',
    descricao: 'Mesa estava com restos de comida da refeição anterior...',
    status: 'aberto' as Status,
  },
  {
    id: 5,
    data: '2026-04-22',
    categoria: 'Atendimento',
    setor: 'Entrada',
    descricao: 'Tempo de espera muito longo para ser atendido...',
    status: 'resolvido' as Status,
  },
];

const statusConfig = {
  aberto: { label: 'Aberto', color: 'bg-red-100 text-red-700' },
  em_andamento: { label: 'Em Andamento', color: 'bg-amber-100 text-amber-700' },
  resolvido: { label: 'Resolvido', color: 'bg-green-100 text-green-700' },
};

export function IssueRegistry() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const filteredIssues = mockIssues.filter(
    (issue) =>
      (filterCategory === 'all' || issue.categoria.toLowerCase() === filterCategory) &&
      (filterStatus === 'all' || issue.status === filterStatus) &&
      (searchTerm === '' ||
        issue.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
        issue.setor.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-orange-50">
      <Navigation title="Registro de Ocorrências" role="manager" />
      <div className="max-w-6xl mx-auto p-4 pb-8">
        <div className="pt-6 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Registro de Ocorrências</h1>
          <p className="text-gray-600 mt-1">Histórico completo de feedbacks</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por descrição ou setor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
            <button className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2">
              <Download className="w-5 h-5" />
              Exportar CSV
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">Todas as Categorias</option>
              <option value="higiene">Higiene</option>
              <option value="atendimento">Atendimento</option>
              <option value="alimento">Alimento</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">Todos os Status</option>
              <option value="aberto">Aberto</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="resolvido">Resolvido</option>
            </select>

            <input
              type="date"
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-orange-100">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">ID</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Data</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Categoria</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Setor</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Descrição</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredIssues.map((issue) => (
                  <tr key={issue.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">#{issue.id}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{issue.data}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{issue.categoria}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{issue.setor}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                      {issue.descricao}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusConfig[issue.status].color}`}>
                        {statusConfig[issue.status].label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => navigate(`/coordenador/ocorrencia/${issue.id}`)}
                        className="text-orange-600 hover:text-orange-700 font-semibold flex items-center gap-1"
                      >
                        <Eye className="w-4 h-4" />
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
