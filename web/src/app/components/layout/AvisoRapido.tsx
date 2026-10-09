import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { EVENTO_AVISO_RAPIDO } from '../../avisoRapido';

// Tempo na tela. Curto o bastante para não atrapalhar, longo para dar tempo de ler.
const DURACAO = 4500;

// A região `role="status"` fica sempre no DOM: o leitor de tela só anuncia mudanças
// numa região que já existia quando o texto chegou.
export function AvisoRapido() {
  const [texto, setTexto] = useState<string | null>(null);
  const relogio = useRef<number>();

  useEffect(() => {
    const mostrar = (evento: Event) => {
      setTexto((evento as CustomEvent<string>).detail);
      window.clearTimeout(relogio.current);
      relogio.current = window.setTimeout(() => setTexto(null), DURACAO);
    };
    window.addEventListener(EVENTO_AVISO_RAPIDO, mostrar);
    return () => {
      window.removeEventListener(EVENTO_AVISO_RAPIDO, mostrar);
      window.clearTimeout(relogio.current);
    };
  }, []);

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 print:hidden"
    >
      {texto && (
        <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-marca-escura py-3 pr-2 pl-4 text-sm font-semibold text-white shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="size-5 flex-none text-[#8fd9c2]" aria-hidden="true" />
          <span className="min-w-0">{texto}</span>
          <button
            type="button"
            onClick={() => setTexto(null)}
            aria-label="Fechar aviso"
            className="flex size-8 flex-none items-center justify-center rounded-lg text-[#b9c7c1] hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
