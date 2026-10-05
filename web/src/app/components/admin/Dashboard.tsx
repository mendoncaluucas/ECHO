import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserCog, QrCode, MapPin, Settings, Activity, Loader2 } from 'lucide-react';
import { Navigation } from '../Navigation';
import {
  encerrarSessao,
  listarAreas,
  listarQRCodes,
  listarUsuarios,
  type Papel,
} from '../../services/api';

type Resumo = {
  coordenadores: number;
  gerentes: number;
  qrCodesAtivos: number;
  areas: number;
};

export function AdminDashboard() {
  const navigate = useNavigate();
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);

  const token = localStorage.getItem('echo_token');
  const buscaAtual = useRef(0);

  useEffect(() => {
    if (!token) {
      navigate('/gerente/login');
      return;
    }

    const minhaVez = ++buscaAtual.current;

    Promise.all([listarUsuarios(token), listarQRCodes(token), listarAreas()])
      .then(([usuarios, qrCodes, areas]) => {
        if (minhaVez !== buscaAtual.current) return;
        const ativos = usuarios.itens.filter((u) => u.ativo);
        const contar = (papel: Papel) => ativos.filter((u) => u.papel === papel).length;

        setResumo({
          coordenadores: contar('COORDENADOR'),
          gerentes: contar('GERENTE'),
          qrCodesAtivos: qrCodes.itens.filter((q) => q.ativo).length,
          areas: areas.itens.length,
        });
      })
      .catch((e: Error & { status?: number }) => {
        if (minhaVez !== buscaAtual.current) return;
        if (e.status === 401) {
          encerrarSessao();
          navigate('/gerente/login');
          return;
        }
        if (e.status === 403) {
          setSemPermissao(true);
          return;
        }
        setErro(e.message || 'Não foi possível carregar o resumo do sistema.');
      })
      .finally(() => {
        if (minhaVez === buscaAtual.current) setCarregando(false);
      });

    return () => {
      buscaAtual.current++;
    };
  }, [token, navigate]);

  const atalhos = (
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
        <p className="text-gray-600">Criar novos QR Codes para mesas e áreas do restaurante</p>
      </button>

      <button
        onClick={() => navigate('/audit-log')}
        className="bg-white hover:bg-slate-50 rounded-2xl shadow-lg p-8 text-left transition-all hover:shadow-xl border-2 border-transparent hover:border-slate-700"
      >
        <Activity className="w-12 h-12 text-slate-700 mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Log de Atividades</h2>
        <p className="text-gray-600">Visualizar histórico completo de ações no sistema</p>
      </button>
    </div>
  );

  const moldura = (conteudo: React.ReactNode) => (
    <div className="min-h-screen bg-slate-50">
      <Navigation title="Painel Administrativo" role="admin" />
      <div className="max-w-6xl mx-auto p-4 pb-8">
        <div className="pt-6 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Painel Administrativo</h1>
          <p className="text-gray-600 mt-1">Gestão completa do sistema</p>
        </div>
        {conteudo}
      </div>
    </div>
  );

  if (semPermissao) {
    return moldura(
      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center space-y-2">
          <h2 className="text-lg font-bold text-gray-900">Acesso restrito</h2>
          <p className="text-gray-600">
            O resumo do sistema é visível apenas para administradores.
          </p>
        </div>
        {atalhos}
      </div>
    );
  }

  if (carregando) {
    return moldura(
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-700" />
      </div>
    );
  }

  return moldura(
    <>
      {erro && (
        <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {erro}
        </p>
      )}

      {resumo && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <UserCog className="w-8 h-8 text-slate-700" />
              <span className="text-3xl font-bold text-gray-900">
                {resumo.coordenadores}
              </span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Coordenadores Ativos</p>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-orange-600">
            <div className="flex items-center justify-between mb-2">
              <Users className="w-8 h-8 text-orange-600" />
              <span className="text-3xl font-bold text-gray-900">{resumo.gerentes}</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Gerentes Ativos</p>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-teal-600">
            <div className="flex items-center justify-between mb-2">
              <QrCode className="w-8 h-8 text-teal-600" />
              <span className="text-3xl font-bold text-gray-900">
                {resumo.qrCodesAtivos}
              </span>
            </div>
            <p className="text-sm text-gray-600 font-medium">QR Codes Ativos</p>
          </div>

          {/* Era "Disponibilidade Sistema: 99.8%", um número inventado. Medir
              disponibilidade de verdade exige um monitor externo batendo no /health —
              não dá para calcular de dentro da própria aplicação que se quer medir.
              Trocado por uma contagem real e do mesmo assunto: o que está cadastrado. */}
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-600">
            <div className="flex items-center justify-between mb-2">
              <MapPin className="w-8 h-8 text-green-600" />
              <span className="text-3xl font-bold text-gray-900">{resumo.areas}</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Áreas Cadastradas</p>
          </div>
        </div>
      )}

      {atalhos}
    </>
  );
}
