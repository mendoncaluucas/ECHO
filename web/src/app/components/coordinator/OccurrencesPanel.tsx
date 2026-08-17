import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Filter, Droplet, Users, UtensilsCrossed, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { Navigation } from '../Navigation';

type Status = 'aberto' | 'em_andamento' | 'resolvido';
type Category = 'higiene' | 'atendimento' | 'alimento';

const mockOccurrences = [
  {
    id: 1,
    category: 'higiene' as Category,
    sector: 'Cozinha',
    status: 'aberto' as Status,
    date: '2026-04-24T14:30:00',
    preview: 'Banheiro com papel higiênico acabando...',
  },
  {
    id: 2,
    category: 'atendimento' as Category,
    sector: 'Salão',
    status: 'em_andamento' as Status,
    date: '2026-04-24T12:15:00',
    preview: 'Garçom muito atencioso, parabéns!',
  },
  {
    id: 3,
    category: 'alimento' as Category,
    sector: 'Cozinha',
    status: 'resolvido' as Status,
    date: '2026-04-23T18:45:00',
    preview: 'A comida estava fria quando chegou...',
  },
  {
    id: 4,
    category: 'higiene' as Category,
    sector: 'Banheiro',
    status: 'aberto' as Status,
    date: '2026-04-23T16:20:00',
    preview: 'Mesa estava com restos de comida...',
  },
];

const categoryIcons = {
  higiene: Droplet,
  atendimento: Users,
  alimento: UtensilsCrossed,
};

const statusConfig = {
  aberto: { label: 'Aberto', color: 'red', icon: AlertCircle },
  em_andamento: { label: 'Em Andamento', color: 'amber', icon: Clock },
  resolvido: { label: 'Resolvido', color: 'green', icon: CheckCircle },
};

export function OccurrencesPanel() {
  const navigate = useNavigate();
  const [filterStatus, setFilterStatus] = useState<Status | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>('all');

  const filteredOccurrences = mockOccurrences.filter(
    (occ) =>
      (filterStatus === 'all' || occ.status === filterStatus) &&
      (filterCategory === 'all' || occ.category === filterCategory)
  );

  return (
    <div className="min-h-screen bg-purple-50">
      <Navigation title="Painel de Ocorrências" role="coordinator" />
      <div className="max-w-4xl mx-auto p-4 pb-8">
        <div className="pt-6 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Painel de Ocorrências</h1>
          <p className="text-gray-600 mt-1">Gerencie feedbacks recebidos</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-5 h-5 text-purple-600" />
            <span className="font-semibold text-gray-900">Filtros</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as Status | 'all')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">Todos</option>
                <option value="aberto">Aberto</option>
                <option value="em_andamento">Em Andamento</option>
                <option value="resolvido">Resolvido</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Categoria
              </label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value as Category | 'all')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">Todas</option>
                <option value="higiene">Higiene</option>
                <option value="atendimento">Atendimento</option>
                <option value="alimento">Alimento</option>
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {filteredOccurrences.map((occ) => {
            const CategoryIcon = categoryIcons[occ.category];
            const statusInfo = statusConfig[occ.status];
            const StatusIcon = statusInfo.icon;

            return (
              <div
                key={occ.id}
                onClick={() => navigate(`/coordenador/ocorrencia/${occ.id}`)}
                className="bg-white rounded-xl shadow-md p-4 hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-purple-600"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <CategoryIcon className="w-6 h-6 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-gray-900 capitalize">
                        {occ.category}
                      </span>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold bg-${statusInfo.color}-100 text-${statusInfo.color}-700 flex items-center gap-1`}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {statusInfo.label}
                      </span>
                    </div>
                    <p className="text-gray-600 text-sm mb-2 truncate">{occ.preview}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{occ.sector}</span>
                      <span>•</span>
                      <span>{new Date(occ.date).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
