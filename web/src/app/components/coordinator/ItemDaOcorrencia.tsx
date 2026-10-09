import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import type { Ocorrencia } from '../../services/api';
import { corDoTipo, haQuanto, rotuloDoStatus, rotuloDoTipo, seloDoStatus } from '../../rotulos';

// Uma ocorrência numa lista: no painel de ocorrências e no "Chegaram agora" do painel
// do gerente. Link de verdade (não botão), para abrir em outra aba com o Ctrl.
export function ItemDaOcorrencia({ ocorrencia: o }: { ocorrencia: Ocorrencia }) {
  return (
    <Link
      to={`/coordenador/ocorrencia/${o.id}`}
      className="-mx-2 flex gap-3.5 rounded-xl px-2 py-3.5 transition-colors hover:bg-[#f6f6f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className={`mt-1.5 size-2.5 flex-none rounded-full ${corDoTipo(o.tipo)}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold">
          {rotuloDoTipo(o.tipo)} · {o.area?.nome ?? 'Restaurante'}
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${seloDoStatus(o.status)}`}>
            {rotuloDoStatus(o.status)}
          </span>
          {/* Só quem deixou e-mail é gravado como identificado: espera retorno. */}
          {!o.anonimo && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">
              <Mail className="size-3" aria-hidden="true" />
              Pediu resposta
            </span>
          )}
        </p>
        {o.comentario ? (
          // break-words: um "kkkkkkkk" sem espaço é texto de cliente possível, e sem
          // quebra sairia cortado sem as reticências do line-clamp.
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed break-words text-[#3a3f4a]">
            “{o.comentario}”
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground italic">Sem comentário</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {o.avaliacoes.map((a) => `${a.categoria} ${a.estrelas}★`).join(' · ')}
          {o.avaliacoes.length > 0 && ' · '}
          <time dateTime={o.criadoEm} title={new Date(o.criadoEm).toLocaleString('pt-BR')}>
            {haQuanto(o.criadoEm)}
          </time>
        </p>
      </div>
    </Link>
  );
}
