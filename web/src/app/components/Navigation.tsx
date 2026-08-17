import { useNavigate } from 'react-router-dom';
import { Bell, Home, LogOut } from 'lucide-react';

interface NavigationProps {
  title: string;
  role: 'customer' | 'coordinator' | 'manager' | 'admin';
}

const roleColors = {
  customer: 'bg-teal-600',
  coordinator: 'bg-purple-600',
  manager: 'bg-orange-600',
  admin: 'bg-slate-700',
};

export function Navigation({ title, role }: NavigationProps) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('userRole');
    navigate('/');
  };

  return (
    <nav className={`${roleColors[role]} text-white shadow-lg`}>
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="hover:bg-white/10 p-2 rounded-lg transition-colors"
            >
              <Home className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold">{title}</h1>
              <p className="text-xs opacity-90">Restaurante Sabor & Cia</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/notificacoes')}
              className="hover:bg-white/10 p-2 rounded-lg transition-colors relative"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            <button
              onClick={handleLogout}
              className="hover:bg-white/10 p-2 rounded-lg transition-colors flex items-center gap-2 px-4"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm font-semibold">Sair</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
