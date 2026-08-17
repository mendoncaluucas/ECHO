import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Star, User, Mail } from 'lucide-react';

type Status = 'aberto' | 'em_andamento' | 'resolvido';

export function OccurrenceDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [status, setStatus] = useState<Status>('aberto');
  const [response, setResponse] = useState('');

  const occurrence = {
    id: Number(id),
    category: 'higiene',
    sector: 'Banheiro',
    rating: 2,
    comment: 'O banheiro estava com papel higiênico acabando e sem sabonete líquido. Além disso, uma das torneiras estava pingando constantemente.',
    type: 'reclamação',
    date: '2026-04-24T14:30:00',
    user: {
      name: 'Maria Silva',
      email: 'maria.silva@email.com',
    },
  };

  const handleSave = () => {
    alert('Alterações salvas com sucesso!');
    navigate('/coordenador/ocorrencias');
  };

  return (
    <div className="min-h-screen bg-purple-50 p-4 pb-8">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate('/coordenador/ocorrencias')}
          className="flex items-center gap-2 text-purple-600 hover:text-purple-700 mb-6 mt-4 font-semibold"
        >
          <ArrowLeft className="w-5 h-5" />
          Voltar
        </button>

        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
          <div className="border-b border-gray-200 pb-4">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl font-bold text-gray-900">
                Ocorrência #{occurrence.id}
              </h1>
              <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-semibold capitalize">
                {occurrence.type}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="font-semibold capitalize">{occurrence.category}</span>
              <span>•</span>
              <span>{occurrence.sector}</span>
              <span>•</span>
              <span>{new Date(occurrence.date).toLocaleString('pt-BR')}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Avaliação
            </label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-6 h-6 ${
                    star <= occurrence.rating
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-gray-300'
                  }`}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Comentário do Cliente
            </label>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-gray-700 leading-relaxed">{occurrence.comment}</p>
            </div>
          </div>

          {occurrence.user && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Informações do Cliente
              </label>
              <div className="bg-purple-50 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-gray-700">
                  <User className="w-4 h-4 text-purple-600" />
                  <span>{occurrence.user.name}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-700">
                  <Mail className="w-4 h-4 text-purple-600" />
                  <span>{occurrence.user.email}</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Responder Ocorrência
            </label>
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="Descreva as ações tomadas e a resolução..."
              className="w-full h-32 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="aberto">Aberto</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="resolvido">Resolvido</option>
            </select>
          </div>

          <button
            onClick={handleSave}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-4 px-6 rounded-xl font-semibold transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2"
          >
            <Save className="w-5 h-5" />
            Salvar Alterações
          </button>
        </div>
      </div>
    </div>
  );
}
