import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getVenue, submitFeedback, type TipoFeedback } from '../../services/api';

// remove acentos e caixa para casar os slugs do formulário com os nomes das categorias do banco
const normalizar = (texto: string) =>
  texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function OptionalId() {
  const navigate = useNavigate();
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async (anonimo: boolean) => {
    setErro(null);

    const pending = JSON.parse(localStorage.getItem('pendingFeedback') || '{}');
    const qrToken: string = pending.qrToken;
    if (!qrToken) {
      setErro('QR Code ausente. Acesse o formulário pelo QR Code da mesa.');
      return;
    }

    const ratings: Record<string, number> = pending.ratings ?? {};
    const comments: Record<string, string> = pending.comments ?? {};

    setEnviando(true);
    try {
      // ids reais das categorias vêm do backend
      const contexto = await getVenue(qrToken);
      const idPorNome = new Map(
        contexto.categorias.map((c) => [normalizar(c.nome), c.id])
      );

      const avaliacoes = Object.entries(ratings)
        .filter(([, estrelas]) => Number(estrelas) >= 1)
        .map(([slug, estrelas]) => ({
          categoriaId: idPorNome.get(normalizar(slug)),
          estrelas: Number(estrelas),
        }))
        .filter((a): a is { categoriaId: string; estrelas: number } => Boolean(a.categoriaId));

      if (avaliacoes.length === 0) {
        setErro('Dê ao menos uma avaliação (estrelas) antes de enviar.');
        setEnviando(false);
        return;
      }

      // backend guarda um comentário só; juntamos os por categoria
      const comentario =
        Object.entries(comments)
          .filter(([, txt]) => txt?.trim())
          .map(([slug, txt]) => `${slug}: ${txt.trim()}`)
          .join(' | ') || undefined;

      const tipo = String(pending.type ?? 'sugestao').toUpperCase() as TipoFeedback;

      await submitFeedback({
        qrToken,
        tipo,
        comentario,
        anonimo,
        contatoEmail: anonimo ? null : email || null,
        avaliacoes,
      });

      localStorage.removeItem('pendingFeedback');
      navigate('/sucesso');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao enviar. Tente novamente.');
    } finally {
      setEnviando(false);
    }
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

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {erro}
            </p>
          )}

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => enviar(true)}
              disabled={enviando}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-3 px-6 rounded-xl font-semibold transition-colors disabled:opacity-60"
            >
              Pular
            </button>
            <button
              onClick={() => enviar(isAnonymous)}
              disabled={enviando}
              className="flex-1 bg-teal-600 hover:bg-teal-700 text-white py-3 px-6 rounded-xl font-semibold transition-colors shadow-md hover:shadow-lg disabled:opacity-60"
            >
              {enviando ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
