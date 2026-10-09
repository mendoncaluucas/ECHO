import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '../ui/sheet';
import { ErrorBoundary } from '../shared/ErrorBoundary';
import { Marca } from './Marca';
import { AvisoRapido } from './AvisoRapido';
import { useContadores, type Contadores } from '../../hooks/useContadores';
import { menuDo, rotuloDaRota, ROTULO_DO_PAPEL, type ItemDoMenu } from '../../navegacao';
import { encerrarSessao, ROTA_DE_LOGIN, type Usuario } from '../../services/api';

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

// "99+" em vez de um número que não cabe no selo.
function abreviar(numero: number) {
  return numero > 99 ? '99+' : String(numero);
}

function SeloDoContador({ item, contadores }: { item: ItemDoMenu; contadores: Contadores }) {
  if (!item.contador) return null;
  const valor = contadores[item.contador];
  if (valor <= 0) return null;

  // Pendente é algo esperando ação; notificação é só novidade. Cores diferentes
  // para os dois não se confundirem num relance.
  return (
    <span
      className={
        item.contador === 'pendentes'
          ? 'ml-auto min-w-6 rounded-full bg-red-50 px-2 py-0.5 text-center text-xs font-bold text-red-700'
          : 'ml-auto min-w-6 rounded-full bg-primary px-2 py-0.5 text-center text-xs font-bold text-primary-foreground'
      }
    >
      {abreviar(valor)}
    </span>
  );
}

function MenuLateral({
  usuario,
  contadores,
  aoSair,
}: {
  usuario: Usuario;
  contadores: Contadores;
  aoSair: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-7 px-4 py-6">
      <div className="px-2">
        <Marca legenda="Restaurante Sinuelo" />
      </div>

      <nav aria-label="Menu principal" className="flex flex-col gap-6">
        {menuDo(usuario.papel).map((secao, indice) => (
          <div key={secao.titulo ?? indice} className="flex flex-col gap-1">
            {secao.titulo && (
              <p className="px-3 pb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {secao.titulo}
              </p>
            )}
            {secao.itens.map((item) => {
              const Icone = item.icone;
              return (
                <NavLink
                  key={item.caminho}
                  to={item.caminho}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                      isActive
                        ? 'bg-accent font-bold text-accent-foreground'
                        : 'font-semibold text-[#3a3f4a] hover:bg-muted'
                    }`
                  }
                >
                  <Icone className="size-[18px] flex-none" aria-hidden="true" />
                  {item.rotulo}
                  <SeloDoContador item={item} contadores={contadores} />
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex items-center gap-3 rounded-xl bg-[#f4f4f0] p-3">
        <span className="flex size-9 flex-none items-center justify-center rounded-full bg-[#d7e9e2] text-sm font-extrabold text-accent-foreground">
          {iniciais(usuario.nome)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-bold">{usuario.nome}</span>
          <span className="text-xs text-muted-foreground">{ROTULO_DO_PAPEL[usuario.papel]}</span>
        </span>
        <button
          type="button"
          onClick={aoSair}
          aria-label="Sair"
          title="Sair"
          className="ml-auto flex size-9 flex-none items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-[#e8e8e3] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <LogOut className="size-[18px]" />
        </button>
      </div>
    </div>
  );
}

// Moldura de todas as telas da gestão: menu lateral (gaveta no celular) só com as
// telas do papel, contadores ao lado dos itens e a tela em si no meio. Fica montada
// entre uma tela e outra, então menu e contadores não piscam ao navegar.
export function LayoutGestao({ usuario }: { usuario: Usuario }) {
  const navigate = useNavigate();
  const location = useLocation();
  const contadores = useContadores(location.pathname);
  const [menuAberto, setMenuAberto] = useState(false);

  // Escolher uma tela no menu do celular fecha a gaveta.
  useEffect(() => {
    setMenuAberto(false);
  }, [location.pathname]);

  // A aba diz em que tela se está: com várias abertas, "Echo" em todas não ajuda.
  useEffect(() => {
    const rotulo = rotuloDaRota(location.pathname);
    document.title = rotulo ? `${rotulo} · Echo` : 'Echo · Restaurante Sinuelo';
  }, [location.pathname]);

  const sair = () => {
    encerrarSessao();
    navigate(ROTA_DE_LOGIN, { replace: true });
  };

  const menu = <MenuLateral usuario={usuario} contadores={contadores} aoSair={sair} />;

  return (
    // A gaveta envolve o layout para o botão do menu, na barra do topo, ser o gatilho
    // dela. O Sheet não desenha nada; só guarda o aberto/fechado.
    <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
      <div className="min-h-full bg-background text-foreground lg:flex">
        <a
          href="#conteudo"
          className="sr-only z-50 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Pular para o conteúdo
        </a>

        {/* Menu e barra do celular somem na impressão: o relatório impresso é só o relatório.
            No papel a largura cai abaixo do `lg`, então a barra do celular apareceria. */}
        <aside className="hidden border-r border-border bg-sidebar print:hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:flex-none lg:flex-col lg:overflow-y-auto">
          {menu}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur print:hidden lg:hidden">
            {/* Gatilho da gaveta (e não um botão solto): fechada a gaveta, o Radix devolve
                o foco a ele. Sem isso, quem navega pelo teclado ficava com o foco perdido. */}
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Abrir menu"
                className="-ml-2 flex size-11 items-center justify-center rounded-[10px] hover:bg-muted"
              >
                <Menu className="size-5" />
              </button>
            </SheetTrigger>
            <Marca />
            <Link
              to="/notificacoes"
              aria-label={
                contadores.notificacoes > 0
                  ? `Notificações: ${contadores.notificacoes} não lidas`
                  : 'Notificações'
              }
              className="relative ml-auto flex size-11 items-center justify-center rounded-[10px] hover:bg-muted"
            >
              <Bell className="size-5" />
              {contadores.notificacoes > 0 && (
                <span className="absolute top-1.5 right-1 min-w-5 rounded-full bg-primary px-1 text-center text-[11px] leading-5 font-bold text-primary-foreground">
                  {abreviar(contadores.notificacoes)}
                </span>
              )}
            </Link>
          </header>

          <main id="conteudo" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
            {/* Chave por tela: um erro numa tela não prende as próximas. */}
            <ErrorBoundary key={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          </main>
          <AvisoRapido />
        </div>

        <SheetContent side="left" aria-describedby={undefined} className="w-72 gap-0 bg-sidebar p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          {menu}
        </SheetContent>
      </div>
    </Sheet>
  );
}
