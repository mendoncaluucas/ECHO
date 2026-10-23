import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { MENU, papelPodeAbrir } from './navegacao';
import { sessaoAtual, type Papel } from './services/api';
import { USUARIOS, apiFalsa, entrarComo, tokenFalso } from '../test/apiFalsa';

// O app inteiro, com o roteador de verdade: guarda das telas, login e sessão.

// Os relatórios trazem a biblioteca de gráficos (centenas de arquivos). Aqui só importa
// se a tela abre para o papel, e cada tela continua baixando depois que o teste da vez
// já terminou: na primeira rodada depois de instalar as dependências, esse carregamento
// travava o teste seguinte por ~30 s (visto duas vezes, sempre no mesmo caso).
vi.mock('./components/manager/Reports', () => ({ Reports: () => null }));

// Resposta genérica para as telas da gestão: aqui importa quem pode abrir o quê, não o
// conteúdo de cada tela (que tem os próprios testes).
const VAZIO = { itens: [], total: 0, naoLidas: 0, pagina: 1, porPagina: 20, paginas: 0 };

function abrirApp(endereco: string) {
  window.history.replaceState(null, '', endereco);
  const usuario = userEvent.setup();
  render(<App />);
  return usuario;
}

const enderecoAtual = () => window.location.pathname + window.location.search;
// Folga para a máquina do CI, mais lenta: o menu chega sob demanda.
const menu = () => screen.findByRole('navigation', { name: 'Menu principal' }, { timeout: 10_000 });
const SEM_ACESSO = 'Esta tela não faz parte do seu acesso';

async function preencherLogin(usuario: ReturnType<typeof userEvent.setup>, { manterConectado = false } = {}) {
  await usuario.type(await screen.findByLabelText('E-mail'), 'pessoa@sinuelo.com');
  await usuario.type(screen.getByLabelText('Senha'), 'senha-de-teste');
  if (manterConectado) await usuario.click(screen.getByRole('checkbox', { name: 'Manter conectado neste aparelho' }));
  await usuario.click(screen.getByRole('button', { name: 'Entrar' }));
}

function respostaDeLogin(papel: Papel) {
  return { corpo: { token: tokenFalso(), usuario: USUARIOS[papel] } };
}

// As telas abertas aqui recebem respostas genéricas e podem cair na tela de erro; o
// React registra isso no console, o que só sujaria a saída.
const calarErroEsperado = (evento: ErrorEvent) => evento.preventDefault();
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  window.addEventListener('error', calarErroEsperado);
  // Sem o pré-carregamento em segundo plano (precarregarTelasDaGestao): aqui ele só
  // disputaria o processador com o teste (os gráficos dos relatórios são pesados) e
  // deixaria a espera pelo menu dependente da velocidade da máquina do CI.
  vi.stubGlobal('requestIdleCallback', vi.fn());
});
afterEach(() => window.removeEventListener('error', calarErroEsperado));

describe('quem pode abrir cada tela', () => {
  const ROTAS = [...MENU.flatMap((s) => s.itens.map((i) => i.caminho)), '/coordenador/ocorrencia/oc-1'];
  const casos = (['COORDENADOR', 'GERENTE', 'ADMINISTRADOR'] as Papel[]).flatMap((papel) =>
    ROTAS.map((rota) => [papel, rota, papelPodeAbrir(papel, rota)] as const)
  );

  // O menu (navegacao.ts) e as rotas (App.tsx) têm cada um a sua lista de papéis. Se
  // divergirem, o menu oferece uma tela que responde "não faz parte do seu acesso", ou
  // a rota abre uma tela que o menu esconde.
  it.each(casos)('%s em %s: pode abrir = %s (o menu e a rota concordam)', async (papel, rota, pode) => {
    apiFalsa().quando('*', { corpo: VAZIO });
    entrarComo(papel);
    abrirApp(rota);
    await menu();

    if (pode) expect(screen.queryByText(SEM_ACESSO)).not.toBeInTheDocument();
    else expect(screen.getByText(SEM_ACESSO)).toBeInTheDocument();
  });

  it('sem sessão: qualquer tela da gestão vai para o login', async () => {
    apiFalsa().quando('*', { corpo: VAZIO });
    abrirApp('/gerente/relatorios');
    expect(await screen.findByRole('heading', { name: 'Bem-vindo ao Echo' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('com sessão, a raiz leva direto ao painel do papel', async () => {
    apiFalsa().quando('*', { corpo: VAZIO });
    entrarComo('COORDENADOR');
    abrirApp('/');
    await menu();
    expect(window.location.pathname).toBe('/coordenador/ocorrencias');
  });

  it('endereço que não existe: "Página não encontrada", não tela em branco', async () => {
    apiFalsa();
    abrirApp('/qualquer/coisa');
    expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument();
  });
});

describe('login', () => {
  it('sem "Manter conectado" (o padrão): sessão no cookie, que some ao fechar o navegador', async () => {
    apiFalsa().quando('POST /auth/login', respostaDeLogin('GERENTE')).quando('*', { corpo: VAZIO });
    const usuario = abrirApp('/');
    await preencherLogin(usuario);

    await menu();
    expect(window.location.pathname).toBe('/gerente/dashboard');
    expect(document.cookie).toContain('echo_sessao=');
    expect(localStorage.getItem('echo_token')).toBeNull();
  });

  it('com "Manter conectado": sessão no localStorage', async () => {
    apiFalsa().quando('POST /auth/login', respostaDeLogin('GERENTE')).quando('*', { corpo: VAZIO });
    const usuario = abrirApp('/');
    await preencherLogin(usuario, { manterConectado: true });

    await menu();
    expect(localStorage.getItem('echo_token')).not.toBeNull();
    expect(document.cookie).not.toContain('echo_sessao=');
  });

  it('o e-mail vai sem espaços', async () => {
    const api = apiFalsa().quando('POST /auth/login', respostaDeLogin('GERENTE')).quando('*', { corpo: VAZIO });
    const usuario = abrirApp('/');
    await usuario.type(await screen.findByLabelText('E-mail'), '  pessoa@sinuelo.com ');
    await usuario.type(screen.getByLabelText('Senha'), 'x');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));
    await menu();
    expect(api.pedidosPara('POST', '/auth/login')[0].corpo).toEqual({ email: 'pessoa@sinuelo.com', senha: 'x' });
  });

  it('senha errada: mensagem clara e nenhuma sessão', async () => {
    apiFalsa().quando('POST /auth/login', {
      status: 401,
      corpo: { erro: 'Credenciais inválidas.', codigo: 'NAO_AUTENTICADO' },
    });
    const usuario = abrirApp('/');
    await preencherLogin(usuario);

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
    expect(sessaoAtual()).toBeNull();
  });

  it('API fora do ar: diz que é a conexão, para ninguém desconfiar da senha', async () => {
    apiFalsa().quando('POST /auth/login', 'sem-rede');
    const usuario = abrirApp('/');
    await preencherLogin(usuario);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível conectar ao servidor.');
  });

  it('cookies bloqueados: pede para liberar, em vez de voltar calado para a entrada', async () => {
    apiFalsa().quando('POST /auth/login', respostaDeLogin('GERENTE'));
    Object.defineProperty(document, 'cookie', { configurable: true, get: () => '', set: () => {} });
    try {
      const usuario = abrirApp('/');
      await preencherLogin(usuario);
      expect(await screen.findByRole('alert')).toHaveTextContent('Libere os cookies deste site');
      expect(window.location.pathname).toBe('/');
    } finally {
      delete (document as { cookie?: string }).cookie;
    }
  });
});

describe('sessão que cai no meio do uso', () => {
  it('vai para o login com o aviso e, ao entrar de novo, volta para a mesma tela', async () => {
    const api = apiFalsa().quando('*', {
      status: 401,
      corpo: { erro: 'Sessão expirada.', codigo: 'TOKEN_INVALIDO' },
    });
    entrarComo('COORDENADOR');
    const usuario = abrirApp('/notificacoes?filtro=nao-lidas');

    expect(await screen.findByText('Sua sessão terminou. Entre de novo para continuar.', {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(sessaoAtual()).toBeNull();

    api.quando('POST /auth/login', respostaDeLogin('COORDENADOR')).quando('*', { corpo: VAZIO });
    await preencherLogin(usuario);
    await menu();
    expect(enderecoAtual()).toBe('/notificacoes?filtro=nao-lidas');
  });

  it('quem entra com outra conta, sem acesso àquela tela, vai para o próprio painel', async () => {
    apiFalsa().quando('POST /auth/login', respostaDeLogin('COORDENADOR')).quando('*', { corpo: VAZIO });
    // Caiu nos relatórios (da gerência) e quem entra agora é a coordenadora.
    const usuario = abrirApp('/gerente/relatorios?de=2026-01-01');
    await preencherLogin(usuario);
    await menu();
    expect(window.location.pathname).toBe('/coordenador/ocorrencias');
    expect(screen.queryByText(SEM_ACESSO)).not.toBeInTheDocument();
  });

  it('a mesma pessoa volta para a tela, com os filtros do endereço', async () => {
    apiFalsa().quando('POST /auth/login', respostaDeLogin('GERENTE')).quando('*', { corpo: VAZIO });
    const usuario = abrirApp('/gerente/relatorios?de=2026-01-01&ate=2026-06-30');
    await preencherLogin(usuario);
    await menu();
    expect(enderecoAtual()).toBe('/gerente/relatorios?de=2026-01-01&ate=2026-06-30');
  });
});

describe('o administrador edita a própria conta', () => {
  it('o nome no menu muda na hora; editar outra pessoa não mexe nele', async () => {
    const lista = [
      { ...USUARIOS.ADMINISTRADOR, email: 'admin@sinuelo.com', setor: null, ativo: true, criadoEm: '2026-09-01T00:00:00Z' },
      { ...USUARIOS.GERENTE, email: 'gerente@sinuelo.com', setor: null, ativo: true, criadoEm: '2026-09-01T00:00:00Z' },
    ];
    apiFalsa()
      .quando('GET /users', { corpo: { itens: lista } })
      .quando('PATCH /users/*', (p) => ({
        corpo: { ...lista.find((u) => p.caminho.endsWith(u.id)), ...(p.corpo as object) },
      }))
      .quando('*', { corpo: VAZIO });
    entrarComo('ADMINISTRADOR');
    const usuario = abrirApp('/admin/usuarios');
    const lateral = await screen.findByRole('complementary', {}, { timeout: 10_000 });

    async function renomear(atual: string, novo: string) {
      await usuario.click(await screen.findByRole('button', { name: `Editar ${atual}` }));
      const campo = await screen.findByLabelText('Nome completo');
      await usuario.clear(campo);
      await usuario.type(campo, novo);
      await usuario.click(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }

    await renomear('Gerente Sinuelo', 'Gerente Renomeado');
    expect(within(lateral).getByText('Administrador Echo')).toBeInTheDocument();

    await renomear('Administrador Echo', 'Administradora Nova');
    expect(within(lateral).getByText('Administradora Nova')).toBeInTheDocument();
    expect(sessaoAtual()?.usuario.nome).toBe('Administradora Nova');
  });
});
