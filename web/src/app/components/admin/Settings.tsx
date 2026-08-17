import { useState } from 'react';
import { Bell, Clock, Shield, Building2, Save } from 'lucide-react';
import { Navigation } from '../Navigation';

export function AdminSettings() {
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState(30);
  const [dataRetention, setDataRetention] = useState(90);
  const [sectors, setSectors] = useState(['Cozinha', 'Salão', 'Banheiro', 'Entrada']);

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation title="Configurações do Sistema" role="admin" />
      <div className="max-w-4xl mx-auto p-4 pb-8">
        <div className="pt-6 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Configurações do Sistema</h1>
          <p className="text-gray-600 mt-1">Personalize preferências e segurança</p>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <Bell className="w-6 h-6 text-slate-700" />
              <h2 className="text-xl font-bold text-gray-900">Preferências de Notificação</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div>
                  <p className="font-semibold text-gray-900">Notificações por E-mail</p>
                  <p className="text-sm text-gray-600">Receber alertas de novos feedbacks por e-mail</p>
                </div>
                <button
                  onClick={() => setEmailNotifications(!emailNotifications)}
                  className={`relative w-14 h-7 rounded-full transition-colors ${
                    emailNotifications ? 'bg-slate-700' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${
                      emailNotifications ? 'translate-x-7' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div>
                  <p className="font-semibold text-gray-900">Notificações Push</p>
                  <p className="text-sm text-gray-600">Receber notificações no navegador</p>
                </div>
                <button
                  onClick={() => setPushNotifications(!pushNotifications)}
                  className={`relative w-14 h-7 rounded-full transition-colors ${
                    pushNotifications ? 'bg-slate-700' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${
                      pushNotifications ? 'translate-x-7' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <Clock className="w-6 h-6 text-slate-700" />
              <h2 className="text-xl font-bold text-gray-900">Tempo de Sessão</h2>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-semibold text-gray-700">
                Tempo máximo de inatividade (minutos)
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="5"
                  max="120"
                  step="5"
                  value={sessionTimeout}
                  onChange={(e) => setSessionTimeout(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="font-bold text-slate-700 text-lg min-w-[60px] text-right">
                  {sessionTimeout} min
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <Shield className="w-6 h-6 text-slate-700" />
              <h2 className="text-xl font-bold text-gray-900">Retenção de Dados (LGPD)</h2>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-semibold text-gray-700">
                Período de armazenamento de dados (dias)
              </label>
              <select
                value={dataRetention}
                onChange={(e) => setDataRetention(Number(e.target.value))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-700"
              >
                <option value={30}>30 dias</option>
                <option value={60}>60 dias</option>
                <option value={90}>90 dias</option>
                <option value={180}>180 dias</option>
                <option value={365}>1 ano</option>
              </select>
              <p className="text-xs text-gray-500 mt-2">
                Após este período, feedbacks anônimos serão automaticamente excluídos conforme a LGPD
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <Building2 className="w-6 h-6 text-slate-700" />
              <h2 className="text-xl font-bold text-gray-900">Configurar Setores e Áreas</h2>
            </div>

            <div className="space-y-3">
              {sectors.map((sector, index) => (
                <div key={index} className="flex items-center gap-3">
                  <input
                    type="text"
                    value={sector}
                    onChange={(e) => {
                      const newSectors = [...sectors];
                      newSectors[index] = e.target.value;
                      setSectors(newSectors);
                    }}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-700"
                  />
                  <button
                    onClick={() => setSectors(sectors.filter((_, i) => i !== index))}
                    className="text-red-600 hover:text-red-700 px-4 py-3 font-semibold"
                  >
                    Remover
                  </button>
                </div>
              ))}
              <button
                onClick={() => setSectors([...sectors, ''])}
                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-slate-700 hover:text-slate-700 font-semibold transition-colors"
              >
                + Adicionar Setor
              </button>
            </div>
          </div>

          <button className="w-full bg-slate-700 hover:bg-slate-800 text-white py-4 px-6 rounded-xl font-semibold transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2">
            <Save className="w-5 h-5" />
            Salvar Configurações
          </button>
        </div>
      </div>
    </div>
  );
}
