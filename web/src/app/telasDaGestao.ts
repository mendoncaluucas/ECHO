import { lazy, type ComponentType } from 'react';
import { papelPodeAbrir } from './navegacao';
import { TELA_INICIAL_POR_PAPEL, type Papel, type Usuario } from './services/api';

// Telas da gestão baixadas sob demanda. Antes o site era um arquivo só, e o cliente que
// escaneava o QR na mesa baixava junto o painel, os gráficos e o log, que nunca vai
// abrir. Agora ele baixa o formulário; a equipe recebe o resto ao entrar.
//
// **Tela nova da gestão:** registrar aqui (com o caminho dela) e usar no App.tsx o
// componente exportado daqui. Importada direto no App, ela funciona, mas volta para o
// arquivo que todo cliente baixa, sem ninguém perceber.

const CHAVE_DA_RECARGA = 'echo_recarga_por_versao';

// Janela em que uma segunda falha não recarrega de novo: tempo de sobra para a
// página voltar e tentar, e curto o bastante para o próximo deploy, horas depois,
// ainda ser coberto.
const JANELA_SEM_NOVA_RECARGA = 10_000;

// Depois de um deploy, os arquivos da versão anterior somem do servidor (a Vercel
// devolve o index.html no lugar, que o navegador recusa como módulo). Quem estava com
// a página aberta e abre uma tela ainda não baixada pediria um arquivo que não existe
// mais. Recarregar traz a versão nova; se falhar de novo logo em seguida, o erro segue
// para a tela de erro em vez de recarregar sem parar.
//
// A marca guarda *quando* recarregou, e não é apagada quando outra tela carrega bem:
// apagada assim, o menu chegava, a tela quebrada falhava de novo e a página entrava
// em ciclo de recargas (visto no teste com um arquivo removido).
//
// Sem internet, não recarrega: trocaria o Echo pela página "sem conexão" do navegador
// e a pessoa perderia o que estava na tela. A tela de erro, com "Recarregar", espera
// a rede voltar.
function comRecargaSeAVersaoMudou<T>(importar: () => Promise<T>): () => Promise<T> {
  return () =>
    importar().catch((erro: unknown) => {
      if (!navigator.onLine) throw erro;

      let recarregouHaPouco = true;
      try {
        const ultima = Number(sessionStorage.getItem(CHAVE_DA_RECARGA));
        recarregouHaPouco = Date.now() - ultima < JANELA_SEM_NOVA_RECARGA;
        if (!recarregouHaPouco) sessionStorage.setItem(CHAVE_DA_RECARGA, String(Date.now()));
      } catch {
        // Sem armazenamento não há como saber se já recarregou: melhor não arriscar.
      }
      if (!recarregouHaPouco) {
        window.location.reload();
        // A página vai recarregar; a promessa nunca resolve, para nada piscar antes.
        return new Promise<T>(() => {});
      }
      throw erro;
    });
}

// Cada tela é exportada com nome; o lazy do React quer um `default`. `caminho` é a
// rota da tela, para pré-carregar só o que o papel de quem entrou pode abrir.
function telaSobDemanda<M>(importar: () => Promise<M>, nome: keyof M, caminho: string | null) {
  const carregar = comRecargaSeAVersaoMudou(importar);
  const Componente = lazy(() =>
    carregar().then((modulo) => ({ default: modulo[nome] as unknown as ComponentType<object> }))
  );
  // O pré-carregamento usa a importação direta, sem a recarga: uma falha de rede em
  // segundo plano não pode recarregar a página no meio do uso. Deu certo, o navegador
  // guarda o módulo e o lazy acima o encontra pronto.
  return { Componente, importar, caminho };
}

const telas = {
  // Sem caminho: o menu é de todos os papéis.
  LayoutGestao: telaSobDemanda(() => import('./components/layout/LayoutGestao'), 'LayoutGestao', null),
  OccurrencesPanel: telaSobDemanda(() => import('./components/coordinator/OccurrencesPanel'), 'OccurrencesPanel', '/coordenador/ocorrencias'),
  OccurrenceDetail: telaSobDemanda(() => import('./components/coordinator/OccurrenceDetail'), 'OccurrenceDetail', '/coordenador/ocorrencia/'),
  Notifications: telaSobDemanda(() => import('./components/shared/Notifications'), 'Notifications', '/notificacoes'),
  ManagerDashboard: telaSobDemanda(() => import('./components/manager/Dashboard'), 'ManagerDashboard', '/gerente/dashboard'),
  IssueRegistry: telaSobDemanda(() => import('./components/manager/IssueRegistry'), 'IssueRegistry', '/gerente/registro'),
  Reports: telaSobDemanda(() => import('./components/manager/Reports'), 'Reports', '/gerente/relatorios'),
  AdminDashboard: telaSobDemanda(() => import('./components/admin/Dashboard'), 'AdminDashboard', '/admin/dashboard'),
  UserManagement: telaSobDemanda(() => import('./components/admin/UserManagement'), 'UserManagement', '/admin/usuarios'),
  AdminSettings: telaSobDemanda(() => import('./components/admin/Settings'), 'AdminSettings', '/admin/configuracoes'),
  QRGenerator: telaSobDemanda(() => import('./components/shared/QRGenerator'), 'QRGenerator', '/qr-generator'),
  AuditLog: telaSobDemanda(() => import('./components/shared/AuditLog'), 'AuditLog', '/audit-log'),
};

export const LayoutGestaoSobDemanda = telas.LayoutGestao.Componente as ComponentType<{ usuario: Usuario }>;
export const OccurrencesPanel = telas.OccurrencesPanel.Componente;
export const OccurrenceDetail = telas.OccurrenceDetail.Componente;
export const Notifications = telas.Notifications.Componente;
export const ManagerDashboard = telas.ManagerDashboard.Componente;
export const IssueRegistry = telas.IssueRegistry.Componente;
export const Reports = telas.Reports.Componente;
export const AdminDashboard = telas.AdminDashboard.Componente;
export const UserManagement = telas.UserManagement.Componente;
export const AdminSettings = telas.AdminSettings.Componente;
export const QRGenerator = telas.QRGenerator.Componente;
export const AuditLog = telas.AuditLog.Componente;

const TELAS_INICIAIS = new Set(Object.values(TELA_INICIAL_POR_PAPEL));
const jaPedidas = new Set<string>();

// Baixa telas da gestão em segundo plano, quando o navegador está ocioso, para entrar
// e clicar no menu não esperarem a rede. O cliente nunca passa por aqui.
//
// - na tela de login (sem papel): só o menu e as telas iniciais de cada papel, que
//   são leves. Ainda não se sabe quem vai entrar;
// - com o papel (no menu, depois de entrar): só o que aquele papel pode abrir. O
//   coordenador, quase sempre no celular, não baixa os gráficos dos relatórios nem
//   as telas do administrador, que não pode abrir.
export function precarregarTelasDaGestao(papel?: Papel) {
  const escolhidas = Object.entries(telas).filter(([chave, tela]) => {
    if (jaPedidas.has(chave)) return false;
    if (tela.caminho === null) return true;
    return papel ? papelPodeAbrir(papel, tela.caminho) : TELAS_INICIAIS.has(tela.caminho);
  });
  if (escolhidas.length === 0) return;
  for (const [chave] of escolhidas) jaPedidas.add(chave);

  const baixar = () => {
    for (const [chave, tela] of escolhidas) {
      tela.importar().catch(() => {
        // Falhou em segundo plano: libera para o próximo pré-carregamento tentar, e a
        // tela, se aberta antes disso, cai na recarga de comRecargaSeAVersaoMudou.
        jaPedidas.delete(chave);
      });
    }
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(baixar, { timeout: 3000 });
  else setTimeout(baixar, 1500);
}
