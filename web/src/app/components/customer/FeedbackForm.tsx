import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Droplet, Users, UtensilsCrossed, Star } from 'lucide-react';

type Category = 'higiene' | 'atendimento' | 'alimento';
type FeedbackType = 'reclamacao' | 'sugestao' | 'elogio';

const categories = [
  { id: 'higiene' as Category, label: 'Higiene', icon: Droplet },
  { id: 'atendimento' as Category, label: 'Atendimento', icon: Users },
  { id: 'alimento' as Category, label: 'Alimento', icon: UtensilsCrossed },
];

export function FeedbackForm() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<Category>('higiene');
  const [ratings, setRatings] = useState<Record<Category, number>>({
    higiene: 0,
    atendimento: 0,
    alimento: 0,
  });
  const [comments, setComments] = useState<Record<Category, string>>({
    higiene: '',
    atendimento: '',
    alimento: '',
  });
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('sugestao');

  const handleSubmit = () => {
    const feedbackData = {
      ratings,
      comments,
      type: feedbackType,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem('pendingFeedback', JSON.stringify(feedbackData));
    navigate('/identificacao');
  };

  return (
    <div className="min-h-screen bg-teal-50 p-4 pb-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center pt-6 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Seu Feedback</h1>
          <p className="text-gray-600 mt-2">Avalie cada categoria</p>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex-1 min-w-[100px] py-3 px-4 rounded-xl font-semibold transition-all ${
                  activeCategory === cat.id
                    ? 'bg-teal-600 text-white shadow-lg'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-5 h-5 mx-auto mb-1" />
                <span className="text-sm">{cat.label}</span>
              </button>
            );
          })}
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Avaliação
            </label>
            <div className="flex gap-2 justify-center">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRatings({ ...ratings, [activeCategory]: star })}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-10 h-10 ${
                      star <= ratings[activeCategory]
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Comentário
            </label>
            <textarea
              value={comments[activeCategory]}
              onChange={(e) =>
                setComments({ ...comments, [activeCategory]: e.target.value })
              }
              placeholder="Conte-nos mais sobre sua experiência..."
              className="w-full h-32 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Tipo de Feedback
            </label>
            <div className="flex gap-2">
              {[
                { id: 'reclamacao' as FeedbackType, label: 'Reclamação', color: 'red' },
                { id: 'sugestao' as FeedbackType, label: 'Sugestão', color: 'blue' },
                { id: 'elogio' as FeedbackType, label: 'Elogio', color: 'green' },
              ].map((type) => (
                <button
                  key={type.id}
                  onClick={() => setFeedbackType(type.id)}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                    feedbackType === type.id
                      ? `bg-${type.color}-100 text-${type.color}-700 border-2 border-${type.color}-500`
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          className="w-full bg-teal-600 hover:bg-teal-700 text-white py-4 px-6 rounded-xl font-semibold transition-colors shadow-md hover:shadow-lg"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
