import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import { Home } from './components/Home';

import { Welcome } from './components/customer/Welcome';
import { FeedbackForm } from './components/customer/FeedbackForm';
import { OptionalId } from './components/customer/OptionalId';
import { Success } from './components/customer/Success';

import { CoordinatorLogin } from './components/coordinator/Login';
import { OccurrencesPanel } from './components/coordinator/OccurrencesPanel';
import { OccurrenceDetail } from './components/coordinator/OccurrenceDetail';

import { ManagerLogin } from './components/manager/Login';
import { ManagerDashboard } from './components/manager/Dashboard';
import { IssueRegistry } from './components/manager/IssueRegistry';
import { Reports } from './components/manager/Reports';

import { AdminDashboard } from './components/admin/Dashboard';
import { UserManagement } from './components/admin/UserManagement';
import { AdminSettings } from './components/admin/Settings';

import { QRGenerator } from './components/shared/QRGenerator';
import { Notifications } from './components/shared/Notifications';
import { AuditLog } from './components/shared/AuditLog';

export default function App() {
  return (
    <Router>
      <div className="size-full">
        <Routes>
          <Route path="/" element={<Home />} />

          <Route path="/boas-vindas" element={<Welcome />} />
          <Route path="/feedback" element={<FeedbackForm />} />
          <Route path="/identificacao" element={<OptionalId />} />
          <Route path="/sucesso" element={<Success />} />

          <Route path="/coordenador/login" element={<CoordinatorLogin />} />
          <Route path="/coordenador/ocorrencias" element={<OccurrencesPanel />} />
          <Route path="/coordenador/ocorrencia/:id" element={<OccurrenceDetail />} />

          <Route path="/gerente/login" element={<ManagerLogin />} />
          <Route path="/gerente/dashboard" element={<ManagerDashboard />} />
          <Route path="/gerente/registro" element={<IssueRegistry />} />
          <Route path="/gerente/relatorios" element={<Reports />} />

          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/usuarios" element={<UserManagement />} />
          <Route path="/admin/configuracoes" element={<AdminSettings />} />

          <Route path="/qr-generator" element={<QRGenerator />} />
          <Route path="/notificacoes" element={<Notifications />} />
          <Route path="/audit-log" element={<AuditLog />} />
        </Routes>
      </div>
    </Router>
  );
}