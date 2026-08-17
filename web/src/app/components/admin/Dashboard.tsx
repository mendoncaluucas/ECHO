import { useNavigate } from 'react-router-dom';
import { Users, UserCog, QrCode, Activity, Settings } from 'lucide-react';
import { Navigation } from '../Navigation';

export function AdminDashboard() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation title="Painel Administrativo" role="admin" />
      <div className="max-w-6xl mx-auto p-4 pb-8">
        <div className="pt-6 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Painel Administrativo</h1>
          <p className="text-gray-600 mt-1">Gestão completa do sistema</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <UserCog className="w-8 h-8 text-slate-700" />
              <span className="text-3xl font-bold text-gray-900">8</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Total de Coordenadores</p>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-orange-600">
            <div className="flex items-center justify-between mb-2">
              <Users className="w-8 h-8 text-orange-600" />
              <span className="text-3xl font-bold text-gray-900">5</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Total de Gerentes</p>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-teal-600">
            <div className="flex items-center justify-between mb-2">
              <QrCode className="w-8 h-8 text-teal-600" />
              <span className="text-3xl font-bold text-gray-900">12</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">QR Codes Ativos</p>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-600">
            <div className="flex items-center justify-between mb-2">
              <Activity className="w-8 h-8 text-green-600" />
              <span className="text-3xl font-bold text-green-600">99.8%</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Disponibilidade Sistema</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            onClick={() => navigate('/admin/usuarios')}
            className="bg-white hover:bg-slate-50 rounded-2xl shadow-lg p-8 text-left transition-all hover:shadow-xl border-2 border-transparent hover:border-slate-700"
          >
            <UserCog className="w-12 h-12 text-slate-700 mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Gerenciar Usuários</h2>
            <p className="text-gray-600">
              Adicionar, editar ou desativar coordenadores, gerentes e administradores
            </p>
          </button>

          <button
            onClick={() => navigate('/admin/configuracoes')}
            className="bg-white hover:bg-slate-50 rounded-2xl shadow-lg p-8 text-left transition-all hover:shadow-xl border-2 border-transparent hover:border-slate-700"
          >
            <Settings className="w-12 h-12 text-slate-700 mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Configurações do Sistema</h2>
            <p className="text-gray-600">
              Ajustar preferências, notificações, LGPD e configurar setores
            </p>
          </button>

          <button
            onClick={() => navigate('/qr-generator')}
            className="bg-white hover:bg-slate-50 rounded-2xl shadow-lg p-8 text-left transition-all hover:shadow-xl border-2 border-transparent hover:border-teal-600"
          >
            <QrCode className="w-12 h-12 text-teal-600 mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Gerenciar QR Codes</h2>
            <p className="text-gray-600">
              Criar novos QR Codes para mesas e áreas do restaurante
            </p>
          </button>

          <button
            onClick={() => navigate('/audit-log')}
            className="bg-white hover:bg-slate-50 rounded-2xl shadow-lg p-8 text-left transition-all hover:shadow-xl border-2 border-transparent hover:border-slate-700"
          >
            <Activity className="w-12 h-12 text-slate-700 mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Log de Atividades</h2>
            <p className="text-gray-600">
              Visualizar histórico completo de ações no sistema
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
