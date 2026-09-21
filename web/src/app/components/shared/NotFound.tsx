import { Link } from 'react-router-dom';
import { Compass, Home } from 'lucide-react';

// Rota coringa. O rewrite da Vercel manda toda URL para o index.html (necessário
// para o SPA), então um endereço errado chegava até aqui e, sem nenhuma rota
// casando, a tela ficava em branco. Vale principalmente para QR Code com token
// digitado errado ou apontando para um caminho que mudou.
export function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center space-y-4">
        <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto">
          <Compass className="w-8 h-8 text-teal-600" />
        </div>

        <h1 className="text-xl font-bold text-gray-900">Página não encontrada</h1>
        <p className="text-gray-600">
          O endereço acessado não existe. Se você chegou por um QR Code, peça ajuda a um
          atendente.
        </p>

        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white py-3 px-6 rounded-xl font-semibold transition-colors"
        >
          <Home className="w-4 h-4" />
          Ir para o início
        </Link>
      </div>
    </div>
  );
}
