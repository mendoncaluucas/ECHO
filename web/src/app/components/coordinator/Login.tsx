import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Shield } from 'lucide-react';
import { login } from '../../services/api';

export function CoordinatorLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const { token, usuario } = await login(email, password);
      localStorage.setItem('echo_token', token);
      localStorage.setItem('echo_usuario', JSON.stringify(usuario));
      localStorage.setItem('userRole', 'coordinator');
      navigate('/coordenador/ocorrencias');
    } catch {
      setErro('Credenciais inválidas');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-600 rounded-full mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Coordenador</h1>
          <p className="text-gray-600 mt-2">Acesse o painel de ocorrências</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="coordenador@restaurante.com"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-4 px-6 rounded-xl font-semibold transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <LogIn className="w-5 h-5" />
            {enviando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Acesso restrito a coordenadores autorizados
        </p>
      </div>
    </div>
  );
}
