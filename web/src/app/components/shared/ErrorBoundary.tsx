import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Home, RotateCw, WifiOff } from 'lucide-react';

// Rede de segurança contra erro de render. Sem isso, uma exceção em qualquer tela
// desmonta a árvore inteira e o usuário vê uma página em branco — sem navegação,
// sem mensagem, sem saber o que fazer. Aconteceu de verdade no dashboard quando a
// API devolveu um campo com outro nome.
//
// Precisa ser class component: não existe equivalente em hooks para capturar erro
// de render de componentes filhos.

interface Props {
  children: ReactNode;
  // Dentro do menu da gestão: ocupa só a área do conteúdo e o menu continua
  // funcionando. Sem isso, ocupa a tela inteira (erro no login, no cliente ou no menu).
  dentroDoMenu?: boolean;
}

interface State {
  erro: Error | null;
}

// A tela não chegou: sem internet, ou um arquivo de outra versão (ver telasDaGestao.ts).
// As mensagens mudam de navegador para navegador.
function ehFalhaAoBaixarATela(erro: Error) {
  return (
    !navigator.onLine ||
    /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
      erro.message
    )
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    // Mantém o rastro no console para quem estiver com o DevTools aberto.
    console.error('Erro não tratado na interface:', erro, info.componentStack);
  }

  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;

    // A raiz é o login da equipe: para o cliente na mesa, "Início" levaria a uma tela
    // que não é para ele. No fluxo do cliente fica só o "Recarregar".
    const ehDoCliente = ['/feedback', '/identificacao', '/sucesso', '/boas-vindas'].some((rota) =>
      window.location.pathname.startsWith(rota)
    );
    const falhaAoBaixar = ehFalhaAoBaixarATela(erro);
    const Icone = falhaAoBaixar ? WifiOff : AlertTriangle;
    // Dentro do menu o conteúdo já está num <main>; fora dele, esta é a página inteira.
    const Envoltorio = this.props.dentroDoMenu ? 'div' : 'main';

    return (
      <Envoltorio
        className={
          this.props.dentroDoMenu
            ? 'flex justify-center px-4 py-10 sm:px-6 lg:py-16'
            : 'flex min-h-full items-center justify-center bg-background p-4 sm:p-6'
        }
      >
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-perigo-fundo text-perigo">
            <Icone className="size-7" aria-hidden="true" />
          </span>

          {/* Falha ao baixar pede ação de quem está usando (conferir a internet); erro
              do código, não. Antes as duas diziam "o problema foi registrado", que não
              ajudava quem estava sem conexão (e não havia registro nenhum além do console). */}
          <h1 className="mt-5 text-xl leading-tight font-extrabold tracking-tight">
            {falhaAoBaixar ? 'Não foi possível abrir esta tela' : 'Algo deu errado nesta tela'}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {falhaAoBaixar
              ? 'Confira a conexão com a internet e toque em Recarregar.'
              : ehDoCliente
                ? 'Toque em Recarregar para tentar de novo.'
                : 'Você pode tentar de novo ou voltar ao seu painel.'}
          </p>

          {/* A mensagem ajuda a equipe a identificar o problema sem abrir o DevTools. */}
          <details className="mt-5 text-left">
            <summary className="w-fit cursor-pointer rounded text-sm font-semibold text-muted-foreground hover:text-foreground">
              Detalhes técnicos
            </summary>
            <p className="mt-2 rounded-lg bg-muted p-3 font-mono text-sm break-words">
              {erro.message || 'Erro sem mensagem.'}
            </p>
          </details>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex h-12 flex-[1_1_9rem] items-center justify-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <RotateCw className="size-4" aria-hidden="true" />
              Recarregar
            </button>
            {/* Link de verdade, não navegação do router: recarrega a página inteira
                e garante estado limpo mesmo se o erro tiver vindo do próprio router. */}
            {!ehDoCliente && (
              <a
                href="/"
                className="flex h-12 flex-[1_1_9rem] items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 font-bold transition-colors hover:bg-muted"
              >
                <Home className="size-4" aria-hidden="true" />
                Meu painel
              </a>
            )}
          </div>
        </div>
      </Envoltorio>
    );
  }
}
