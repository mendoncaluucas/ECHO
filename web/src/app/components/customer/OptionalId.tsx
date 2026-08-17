import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function OptionalId() {
  const navigate = useNavigate();
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const handleSubmit = () => {
    const feedback = JSON.parse(localStorage.getItem('pendingFeedback') || '{}');
    const finalFeedback = {
      ...feedback,
      user: isAnonymous ? null : { name, email },
      anonymous: isAnonymous,
    };

    const existingFeedbacks = JSON.parse(localStorage.getItem('feedbacks') || '[]');
    existingFeedbacks.push(finalFeedback);
    localStorage.setItem('feedbacks', JSON.stringify(existingFeedbacks));
    localStorage.removeItem('pendingFeedback');

    navigate('/sucesso');
  };

  return (
    <div className="min-h-screen bg-teal-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Identificação</h1>
          <p className="text-gray-600 mt-2">Opcional - você decide</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
          <div className="flex items-center gap-3 p-4 bg-teal-50 rounded-xl">
            <input
              type="checkbox"
              id="anonymous"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="w-5 h-5 text-teal-600 rounded focus:ring-2 focus:ring-teal-500"
            />
            <label htmlFor="anonymous" className="font-medium text-gray-900 cursor-pointer">
              Prefiro permanecer anônimo
            </label>
          </div>

          {!isAnonymous && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Nome
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome completo"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => {
                setIsAnonymous(true);
                setTimeout(handleSubmit, 100);
              }}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-3 px-6 rounded-xl font-semibold transition-colors"
            >
              Pular
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 bg-teal-600 hover:bg-teal-700 text-white py-3 px-6 rounded-xl font-semibold transition-colors shadow-md hover:shadow-lg"
            >
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
