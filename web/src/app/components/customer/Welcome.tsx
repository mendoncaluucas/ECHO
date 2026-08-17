import { useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';

export function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 to-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-24 h-24 bg-teal-600 rounded-full flex items-center justify-center">
            <MessageSquare className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 text-center">
            Restaurante Sabor & Cia
          </h1>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold text-gray-900 text-center">
              Bem-vindo!
            </h2>
            <p className="text-gray-600 text-center leading-relaxed">
              Sua opinião é muito importante para nós. Ajude-nos a melhorar
              nossos serviços compartilhando sua experiência.
            </p>
          </div>

          <button
            onClick={() => navigate('/feedback')}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white py-4 px-6 rounded-xl font-semibold transition-colors shadow-md hover:shadow-lg"
          >
            Deixar Feedback
          </button>
        </div>

        <p className="text-sm text-gray-500 text-center">
          Leva apenas 2 minutos
        </p>
      </div>
    </div>
  );
}
