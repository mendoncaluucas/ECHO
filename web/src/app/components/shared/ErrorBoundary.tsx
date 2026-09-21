import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCw, Home } from 'lucide-react';

// Rede de segurança contra erro de render. Sem isso, uma exceção em qualquer tela
// desmonta a árvore inteira e o usuário vê uma página em branco — sem navegação,
// sem mensagem, sem saber o que fazer. Aconteceu de verdade no dashboard quando a
// API devolveu um campo com outro nome.
//
// Precisa ser class component: não existe equivalente em hooks para capturar erro
// de render de componentes filhos.

interface Props {
  children: ReactNode;
}

interface State {
  erro: Error | null;
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

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>

          <h1 className="text-xl font-bold text-gray-900">Algo deu errado nesta tela</h1>
          <p className="text-gray-600">
            O problema foi registrado. Você pode tentar de novo ou voltar ao início.
          </p>

          {/* A mensagem ajuda a equipe a identificar o problema sem abrir o DevTools. */}
          <details className="text-left">
            <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
              Detalhes técnicos
            </summary>
            <p className="mt-2 text-sm text-gray-700 bg-gray-50 rounded-lg p-3 break-words font-mono">
              {erro.message || 'Erro sem mensagem.'}
            </p>
          </details>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 bg-gray-900 hover:bg-gray-800 text-white py-3 px-4 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <RotateCw className="w-4 h-4" />
              Recarregar
            </button>
            {/* Link de verdade, não navegação do router: recarrega a página inteira
                e garante estado limpo mesmo se o erro tiver vindo do próprio router. */}
            <a
              href="/"
              className="flex-1 bg-white hover:bg-gray-50 text-gray-900 border-2 border-gray-300 py-3 px-4 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              Início
            </a>
          </div>
        </div>
      </div>
    );
  }
}
