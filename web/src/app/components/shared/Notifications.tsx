import { useState } from 'react';
import { Bell, CheckCheck, Droplet, Users, UtensilsCrossed } from 'lucide-react';

const mockNotifications = [
  {
    id: 1,
    message: 'Novo feedback de Higiene recebido',
    sector: 'Banheiro',
    category: 'higiene',
    timestamp: '2026-04-24T15:30:00',
    read: false,
  },
  {
    id: 2,
    message: 'Feedback de Atendimento respondido',
    sector: 'Salão',
    category: 'atendimento',
    timestamp: '2026-04-24T14:15:00',
    read: false,
  },
  {
    id: 3,
    message: 'Nova sugestão sobre Alimento',
    sector: 'Cozinha',
    category: 'alimento',
    timestamp: '2026-04-24T13:45:00',
    read: true,
  },
  {
    id: 4,
    message: 'Reclamação de Higiene em aberto',
    sector: 'Cozinha',
    category: 'higiene',
    timestamp: '2026-04-24T12:00:00',
    read: true,
  },
  {
    id: 5,
    message: 'Elogio ao atendimento recebido',
    sector: 'Entrada',
    category: 'atendimento',
    timestamp: '2026-04-24T11:30:00',
    read: true,
  },
];

const categoryIcons = {
  higiene: { icon: Droplet, color: 'text-cyan-600 bg-cyan-100' },
  atendimento: { icon: Users, color: 'text-purple-600 bg-purple-100' },
  alimento: { icon: UtensilsCrossed, color: 'text-orange-600 bg-orange-100' },
};

export function Notifications() {
  const [notifications, setNotifications] = useState(mockNotifications);

  const markAsRead = (id: number) => {
    setNotifications(
      notifications.map((notif) =>
        notif.id === id ? { ...notif, read: true } : notif
      )
    );
  };

  const markAllAsRead = () => {
    setNotifications(notifications.map((notif) => ({ ...notif, read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      <div className="max-w-3xl mx-auto">
        <div className="pt-6 pb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notificações</h1>
            <p className="text-gray-600 mt-1">
              {unreadCount > 0 ? `${unreadCount} não lidas` : 'Todas lidas'}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-2 bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              <CheckCheck className="w-4 h-4" />
              Marcar todas como lidas
            </button>
          )}
        </div>

        <div className="space-y-3">
          {notifications.map((notif) => {
            const categoryInfo = categoryIcons[notif.category as keyof typeof categoryIcons];
            const Icon = categoryInfo.icon;

            return (
              <div
                key={notif.id}
                className={`bg-white rounded-xl shadow-md p-4 transition-all border-l-4 ${
                  notif.read
                    ? 'border-gray-300 opacity-75'
                    : 'border-gray-700 shadow-lg'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 ${categoryInfo.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <p className={`font-semibold ${notif.read ? 'text-gray-600' : 'text-gray-900'}`}>
                        {notif.message}
                      </p>
                      {!notif.read && (
                        <span className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-2"></span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-500 mb-3">
                      <span className="font-medium">{notif.sector}</span>
                      <span>•</span>
                      <span>{new Date(notif.timestamp).toLocaleString('pt-BR')}</span>
                    </div>
                    {!notif.read && (
                      <button
                        onClick={() => markAsRead(notif.id)}
                        className="text-sm text-gray-700 hover:text-gray-900 font-semibold"
                      >
                        Marcar como lido
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {notifications.length === 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">Nenhuma notificação</p>
          </div>
        )}
      </div>
    </div>
  );
}
