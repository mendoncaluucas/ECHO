import { useEffect } from 'react';
import {
  BrowserRouter as Router,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';

import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { Entrar } from './components/Entrar';
import { ExigePapel, RotaProtegida } from './components/layout/RotaProtegida';
import { ADMINISTRACAO, GERENCIA, GESTAO, rotuloDaRota } from './navegacao';
import { EVENTO_SESSAO_ENCERRADA, ROTA_DE_LOGIN } from './services/api';

import { Welcome } from './components/customer/Welcome';
import { FeedbackForm } from './components/customer/FeedbackForm';
import { OptionalId } from './components/customer/OptionalId';
import { Success } from './components/customer/Success';

import { OccurrencesPanel } from './components/coordinator/OccurrencesPanel';
import { OccurrenceDetail } from './components/coordinator/OccurrenceDetail';

import { ManagerDashboard } from './components/manager/Dashboard';
import { IssueRegistry } from './components/manager/IssueRegistry';
import { Reports } from './components/manager/Reports';

import { AdminDashboard } from './components/admin/Dashboard';
import { UserManagement } from './components/admin/UserManagement';
import { AdminSettings } from './components/admin/Settings';

import { QRGenerator } from './components/shared/QRGenerator';
import { Notifications } from './components/shared/Notifications';
import { AuditLog } from './components/shared/AuditLog';
import { NotFound } from './components/shared/NotFound';

// Sessão encerrada no meio do uso (vencida, desativada pelo administrador, cortada
// pelo tempo de sessão): o serviço da API avisa, e daqui se vai ao login lembrando a
// tela, para voltar a ela depois de entrar.
function OuvinteDaSessao() {
  const navigate = useNavigate();

  useEffect(() => {
    const irParaOLogin = () => {
      // A tela é lida agora, no momento do erro. A navegação espera um ciclo porque as
      // telas antigas ainda mandam para o login por conta própria no 401 (até serem
      // redesenhadas); sem a espera, a delas viria depois e apagaria a tela lembrada.
      const de = window.location.pathname + window.location.search;
      window.setTimeout(() => navigate(ROTA_DE_LOGIN, { replace: true, state: { de } }), 0);
    };
    window.addEventListener(EVENTO_SESSAO_ENCERRADA, irParaOLogin);
    return () => window.removeEventListener(EVENTO_SESSAO_ENCERRADA, irParaOLogin);
  }, [navigate]);

  return null;
}

function Rotas() {
  const location = useLocation();
  // Nas telas da gestão quem reinicia o boundary a cada navegação é o do layout; uma
  // chave por tela aqui desmontaria o layout inteiro (e o menu piscaria) a cada clique.
  const ehDaGestao = rotuloDaRota(location.pathname) !== null;
  const chave = ehDaGestao ? 'gestao' : location.pathname;

  // Nas telas da gestão o layout põe o nome da tela na aba; fora dela (login, cliente)
  // a aba volta ao nome do sistema, senão o login herdaria "Registro · Echo".
  useEffect(() => {
    if (!ehDaGestao) document.title = 'Echo · Restaurante Sinuelo';
  }, [ehDaGestao, location.pathname]);

  return (
    <ErrorBoundary key={chave}>
      <OuvinteDaSessao />
      <Routes>
        <Route path="/" element={<Entrar />} />
        {/* Logins antigos, por papel: links e favoritos guardados continuam valendo. */}
        <Route path="/gerente/login" element={<Navigate to={ROTA_DE_LOGIN} replace />} />
        <Route path="/coordenador/login" element={<Navigate to={ROTA_DE_LOGIN} replace />} />

        {/* Cliente: só pelo QR Code da mesa. */}
        <Route path="/boas-vindas" element={<Welcome />} />
        <Route path="/feedback" element={<FeedbackForm />} />
        <Route path="/identificacao" element={<OptionalId />} />
        <Route path="/sucesso" element={<Success />} />

        {/* Gestão: sessão obrigatória, menu lateral, e cada tela com os seus papéis
            (mesma tabela do menu, em navegacao.ts). */}
        <Route element={<RotaProtegida />}>
          <Route
            path="/coordenador/ocorrencias"
            element={<ExigePapel papeis={GESTAO}><OccurrencesPanel /></ExigePapel>}
          />
          <Route
            path="/coordenador/ocorrencia/:id"
            element={<ExigePapel papeis={GESTAO}><OccurrenceDetail /></ExigePapel>}
          />
          <Route
            path="/notificacoes"
            element={<ExigePapel papeis={GESTAO}><Notifications /></ExigePapel>}
          />

          <Route
            path="/gerente/dashboard"
            element={<ExigePapel papeis={GERENCIA}><ManagerDashboard /></ExigePapel>}
          />
          <Route
            path="/gerente/registro"
            element={<ExigePapel papeis={GERENCIA}><IssueRegistry /></ExigePapel>}
          />
          <Route
            path="/gerente/relatorios"
            element={<ExigePapel papeis={GERENCIA}><Reports /></ExigePapel>}
          />

          <Route
            path="/admin/dashboard"
            element={<ExigePapel papeis={ADMINISTRACAO}><AdminDashboard /></ExigePapel>}
          />
          <Route
            path="/admin/usuarios"
            element={<ExigePapel papeis={ADMINISTRACAO}><UserManagement /></ExigePapel>}
          />
          <Route
            path="/admin/configuracoes"
            element={<ExigePapel papeis={ADMINISTRACAO}><AdminSettings /></ExigePapel>}
          />
          <Route
            path="/qr-generator"
            element={<ExigePapel papeis={ADMINISTRACAO}><QRGenerator /></ExigePapel>}
          />
          <Route
            path="/audit-log"
            element={<ExigePapel papeis={ADMINISTRACAO}><AuditLog /></ExigePapel>}
          />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <Router>
      <div className="size-full">
        <Rotas />
      </div>
    </Router>
  );
}
