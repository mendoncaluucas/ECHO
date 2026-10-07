import { useLocation, useNavigate } from 'react-router-dom';
import { Check, MessageSquarePlus } from 'lucide-react';

export function Success() {
  const navigate = useNavigate();
  const location = useLocation();
  // Vindos do formulário. Ausentes se a página foi aberta direto.
  const { qrToken, comRetorno } =
    (location.state as { qrToken?: string; comRetorno?: boolean } | null) ?? {};

  return (
    <div className="flex min-h-full items-center justify-center bg-background p-6">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <span className="flex size-24 items-center justify-center rounded-full bg-accent animate-in zoom-in-50 fade-in duration-500">
          <span className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-9" strokeWidth={3} aria-hidden="true" />
          </span>
        </span>

        <h1 className="mt-7 text-[28px] leading-tight font-extrabold tracking-tight animate-in fade-in slide-in-from-bottom-2 duration-500">
          Obrigado pela sua avaliação!
        </h1>
        <p className="mt-3 text-muted-foreground animate-in fade-in duration-700">
          {comRetorno
            ? 'Ela já chegou à equipe, que pode te responder pelo e-mail que você deixou.'
            : 'Ela já chegou à equipe do restaurante. Pode fechar esta página.'}
        </p>

        {/* Não há "início" para o cliente: a raiz é o login da equipe. O que faz sentido
            é outra pessoa da mesma mesa avaliar também. */}
        {qrToken && (
          <button
            type="button"
            onClick={() => navigate(`/feedback?t=${encodeURIComponent(qrToken)}`)}
            className="mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card font-bold text-foreground transition hover:bg-muted"
          >
            <MessageSquarePlus className="size-5" aria-hidden="true" />
            Outra pessoa da mesa quer avaliar
          </button>
        )}
      </div>
    </div>
  );
}
