import { useNavigate } from 'react-router-dom';
import { MessageSquare, Shield, BarChart3, Settings } from 'lucide-react';

export function Home() {
  const navigate = useNavigate();

  const roles = [
    {
      title: 'Cliente',
      description: 'Deixar feedback sobre sua experiência',
      icon: MessageSquare,
      color: 'bg-teal-600 hover:bg-teal-700',
      path: '/boas-vindas',
    },
    {
      title: 'Coordenador',
      description: 'Gerenciar ocorrências e feedbacks',
      icon: Shield,
      color: 'bg-purple-600 hover:bg-purple-700',
      path: '/coordenador/login',
    },
    {
      title: 'Gerente',
      description: 'Visualizar dashboards e relatórios',
      icon: BarChart3,
      color: 'bg-orange-600 hover:bg-orange-700',
      path: '/gerente/login',
    },
    {
      title: 'Administrador',
      description: 'Configurar sistema e usuários',
      icon: Settings,
      color: 'bg-slate-700 hover:bg-slate-800',
      path: '/admin/dashboard',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Sistema de Feedback
          </h1>
          <p className="text-xl text-gray-600">
            Restaurante Sabor & Cia
          </p>
          <p className="text-gray-500 mt-2">
            Selecione como você deseja acessar o sistema
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {roles.map((role) => {
            const Icon = role.icon;
            return (
              <button
                key={role.title}
                onClick={() => navigate(role.path)}
                className={`${role.color} text-white rounded-2xl shadow-lg p-8 text-left transition-all hover:shadow-2xl hover:scale-105 transform`}
              >
                <Icon className="w-16 h-16 mb-4" />
                <h2 className="text-2xl font-bold mb-2">{role.title}</h2>
                <p className="text-white/90">{role.description}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500">
            Versão 1.0 • Sistema protegido com autenticação
          </p>
        </div>
      </div>
    </div>
  );
}
