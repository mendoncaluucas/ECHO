import { useState } from 'react';
import { FileText, Filter } from 'lucide-react';

const mockLogs = [
  {
    id: 1,
    timestamp: '2026-04-24T15:45:23',
    user: 'João Silva',
    action: 'Respondeu a ocorrência #42',
    recordId: '42',
  },
  {
    id: 2,
    timestamp: '2026-04-24T15:30:15',
    user: 'Maria Santos',
    action: 'Alterou status para "Resolvido"',
    recordId: '38',
  },
  {
    id: 3,
    timestamp: '2026-04-24T15:15:00',
    user: 'Pedro Costa',
    action: 'Criou novo usuário coordenador',
    recordId: 'USR-123',
  },
  {
    id: 4,
    timestamp: '2026-04-24T14:50:45',
    user: 'Ana Oliveira',
    action: 'Gerou QR Code para Mesa 5',
    recordId: 'QR-567',
  },
  {
    id: 5,
    timestamp: '2026-04-24T14:30:12',
    user: 'Carlos Pereira',
    action: 'Exportou relatório mensal',
    recordId: 'REP-2026-04',
  },
  {
    id: 6,
    timestamp: '2026-04-24T14:15:33',
    user: 'João Silva',
    action: 'Alterou configurações de notificação',
    recordId: 'CFG-001',
  },
  {
    id: 7,
    timestamp: '2026-04-24T13:45:20',
    user: 'Maria Santos',
    action: 'Adicionou setor "Área Externa"',
    recordId: 'SEC-008',
  },
  {
    id: 8,
    timestamp: '2026-04-24T13:30:00',
    user: 'Ana Oliveira',
    action: 'Desativou usuário',
    recordId: 'USR-098',
  },
];

export function AuditLog() {
  const [filterUser, setFilterUser] = useState('all');

  const users = ['all', ...Array.from(new Set(mockLogs.map((log) => log.user)))];

  const filteredLogs =
    filterUser === 'all'
      ? mockLogs
      : mockLogs.filter((log) => log.user === filterUser);

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      <div className="max-w-6xl mx-auto">
        <div className="pt-6 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Log de Atividades</h1>
          <p className="text-gray-600 mt-1">Auditoria completa do sistema</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <Filter className="w-5 h-5 text-gray-700" />
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-700"
            >
              <option value="all">Todos os Usuários</option>
              {users.slice(1).map((user) => (
                <option key={user} value={user}>
                  {user}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                    Data/Hora
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                    Usuário
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                    Ação Realizada
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                    ID do Registro
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900 font-mono">
                      {new Date(log.timestamp).toLocaleString('pt-BR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {log.user}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{log.action}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                      {log.recordId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {filteredLogs.length === 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">Nenhum registro encontrado</p>
          </div>
        )}
      </div>
    </div>
  );
}
