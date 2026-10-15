import { Link } from 'react-router-dom';
import { Compass, LogIn } from 'lucide-react';

// Rota coringa. O rewrite da Vercel manda toda URL para o index.html (necessário
// para o SPA), então um endereço errado chegava até aqui e, sem nenhuma rota
// casando, a tela ficava em branco. Vale principalmente para QR Code com token
// digitado errado ou apontando para um caminho que mudou.
export function NotFound() {
  return (
    <main className="flex min-h-full items-center justify-center bg-background p-4 sm:p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Compass className="size-7" aria-hidden="true" />
        </span>

        <h1 className="mt-5 text-xl leading-tight font-extrabold tracking-tight">Página não encontrada</h1>
        <p className="mt-2 text-muted-foreground">
          O endereço acessado não existe. Se você chegou por um QR Code, peça ajuda a um
          atendente.
        </p>

        {/* A raiz é o login da equipe, então o link diz isso: o cliente que chegou por
            um QR errado não tem o que fazer lá, e o texto acima já o orienta. Discreto
            de propósito, para o cliente não achar que precisa entrar. */}
        <Link
          to="/"
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 font-bold transition-colors hover:bg-muted"
        >
          <LogIn className="size-4" aria-hidden="true" />
          Sou da equipe: entrar
        </Link>
      </div>
    </main>
  );
}
