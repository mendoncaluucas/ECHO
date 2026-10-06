import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Home, LogOut } from 'lucide-react';
import { contarNotificacoes, encerrarSessao, EVENTO_NOTIFICACOES } from '../services/api';

// Um minuto basta para quem está no salão: o feedback não some se o sino demorar.
const INTERVALO_DO_SINO = 60_000;

// Contador do sino. Consulta só com a aba visível — aba esquecida aberta não fica
// batendo na API a noite inteira — e reconta ao voltar para ela.
//
// Erro aqui é silencioso de propósito: o sino é acessório. Sessão vencida, quem trata
// é a tela, que redireciona para o login; o sino só não mostra número.
function useNaoLidas() {
  const [naoLidas, setNaoLidas] = useState(0);

  useEffect(() => {
    let ativo = true;

    const contar = () => {
      const token = localStorage.getItem('echo_token');
      if (!token || document.visibilityState !== 'visible') return;
      contarNotificacoes(token)
        .then((res) => {
          if (ativo) setNaoLidas(res.naoLidas);
        })
        .catch(() => {});
    };

    contar();
    const intervalo = window.setInterval(contar, INTERVALO_DO_SINO);
    document.addEventListener('visibilitychange', contar);
    window.addEventListener(EVENTO_NOTIFICACOES, contar);

    return () => {
      ativo = false;
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', contar);
      window.removeEventListener(EVENTO_NOTIFICACOES, contar);
    };
  }, []);

  return naoLidas;
}

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
  const naoLidas = useNaoLidas();

  const handleLogout = () => {
    encerrarSessao();
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
              <p className="text-xs opacity-90">Restaurante Sinuelo</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/notificacoes')}
              className="hover:bg-white/10 p-2 rounded-lg transition-colors relative"
              aria-label={
                naoLidas > 0 ? `Notificações: ${naoLidas} não lidas` : 'Notificações'
              }
            >
              <Bell className="w-5 h-5" />
              {naoLidas > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {naoLidas > 99 ? '99+' : naoLidas}
                </span>
              )}
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
