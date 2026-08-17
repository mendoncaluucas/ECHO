import { useState } from 'react';
import { Plus, Edit, UserX, Search } from 'lucide-react';
import { Navigation } from '../Navigation';

type UserRole = 'coordenador' | 'gerente' | 'admin';

const mockUsers = [
  {
    id: 1,
    nome: 'João Silva',
    email: 'joao.silva@restaurante.com',
    perfil: 'coordenador' as UserRole,
    setor: 'Cozinha',
    ativo: true,
  },
  {
    id: 2,
    nome: 'Maria Santos',
    email: 'maria.santos@restaurante.com',
    perfil: 'gerente' as UserRole,
    setor: 'Geral',
    ativo: true,
  },
  {
    id: 3,
    nome: 'Pedro Costa',
    email: 'pedro.costa@restaurante.com',
    perfil: 'coordenador' as UserRole,
    setor: 'Salão',
    ativo: true,
  },
  {
    id: 4,
    nome: 'Ana Oliveira',
    email: 'ana.oliveira@restaurante.com',
    perfil: 'admin' as UserRole,
    setor: 'TI',
    ativo: true,
  },
  {
    id: 5,
    nome: 'Carlos Pereira',
    email: 'carlos.pereira@restaurante.com',
    perfil: 'coordenador' as UserRole,
    setor: 'Banheiro',
    ativo: false,
  },
];

const roleColors = {
  coordenador: 'bg-purple-100 text-purple-700',
  gerente: 'bg-orange-100 text-orange-700',
  admin: 'bg-slate-700 text-white',
};

export function UserManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const filteredUsers = mockUsers.filter(
    (user) =>
      user.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation title="Gerenciamento de Usuários" role="admin" />
      <div className="max-w-6xl mx-auto p-4 pb-8">
        <div className="pt-6 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Gerenciamento de Usuários</h1>
          <p className="text-gray-600 mt-1">Controle de acessos e permissões</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome ou e-mail..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-700"
                />
              </div>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-slate-700 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Adicionar Usuário
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Nome</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">E-mail</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Perfil</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Setor</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.nome}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${roleColors[user.perfil]}`}>
                        {user.perfil.charAt(0).toUpperCase() + user.perfil.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{user.setor}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          user.ativo
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {user.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button className="text-slate-700 hover:text-slate-900 p-2">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button className="text-red-600 hover:text-red-700 p-2">
                          <UserX className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Adicionar Novo Usuário</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Nome Completo</label>
                  <input
                    type="text"
                    placeholder="Nome do usuário"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">E-mail</label>
                  <input
                    type="email"
                    placeholder="email@restaurante.com"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Perfil</label>
                  <select className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-700">
                    <option value="coordenador">Coordenador</option>
                    <option value="gerente">Gerente</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Setor</label>
                  <input
                    type="text"
                    placeholder="Ex: Cozinha, Salão"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-700"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-3 rounded-xl font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    alert('Usuário adicionado com sucesso!');
                    setShowAddModal(false);
                  }}
                  className="flex-1 bg-slate-700 hover:bg-slate-800 text-white py-3 rounded-xl font-semibold transition-colors"
                >
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
