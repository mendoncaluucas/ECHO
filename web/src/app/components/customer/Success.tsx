import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, MessageSquarePlus } from 'lucide-react';

export function Success() {
  const navigate = useNavigate();
  const location = useLocation();
  // QR da mesa, vindo da etapa anterior. Ausente se a página foi aberta direto.
  const qrToken = (location.state as { qrToken?: string } | null)?.qrToken;

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 to-white flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-8">
        <div className="flex justify-center">
          <div className="w-32 h-32 bg-teal-100 rounded-full flex items-center justify-center animate-bounce">
            <CheckCircle2 className="w-20 h-20 text-teal-600" />
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-gray-900">
            Seu feedback foi enviado!
          </h1>
          <p className="text-lg text-gray-600">
            Obrigado pela sua avaliação!
          </p>
          <p className="text-gray-500">
            Suas sugestões nos ajudam a melhorar continuamente nossos serviços.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Nossa equipe vai analisar seu feedback e trabalhar nas melhorias necessárias. Pode
            fechar esta página.
          </p>
          {/* Não há "início" para o cliente: a raiz é o login da equipe. O que faz sentido
              é outra pessoa da mesma mesa avaliar também. */}
          {qrToken && (
            <button
              onClick={() => navigate(`/feedback?t=${encodeURIComponent(qrToken)}`)}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white py-3 px-6 rounded-xl font-semibold transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2"
            >
              <MessageSquarePlus className="w-5 h-5" />
              Enviar outra avaliação
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
