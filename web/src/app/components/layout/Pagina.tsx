import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ChevronRight, RotateCw, type LucideIcon } from 'lucide-react';

// Peças das telas da gestão no visual novo: a mesma margem, o mesmo cabeçalho e o
// mesmo cartão em todas, para que trocar de tela não pareça trocar de sistema.

export function Pagina({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-12 sm:px-6 lg:px-10 lg:pt-8">{children}</div>;
}

export function CabecalhoDaPagina({
  sobretitulo,
  titulo,
  descricao,
  acoes,
}: {
  sobretitulo?: ReactNode;
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {sobretitulo && <p className="text-sm font-semibold text-muted-foreground">{sobretitulo}</p>}
        <h1 className="mt-1 text-2xl leading-tight font-extrabold tracking-tight sm:text-3xl">
          {titulo}
        </h1>
        {descricao && <p className="mt-1.5 text-muted-foreground">{descricao}</p>}
      </div>
      {acoes}
    </header>
  );
}

export function Cartao({
  titulo,
  descricao,
  acao,
  children,
  className = '',
}: {
  titulo?: ReactNode;
  descricao?: ReactNode;
  acao?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const idDoTitulo = useId();
  return (
    <section
      aria-labelledby={titulo ? idDoTitulo : undefined}
      className={`min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-6 ${className}`}
    >
      {titulo && (
        // Sem espaço para os dois, a ação desce para baixo do título: ao lado, num
        // celular, espremia o título em uma palavra por linha.
        <div className="mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-[1_1_10rem]">
            <h2 id={idDoTitulo} className="text-lg leading-snug font-extrabold">
              {titulo}
            </h2>
            {descricao && <p className="mt-0.5 text-sm text-muted-foreground">{descricao}</p>}
          </div>
          {acao}
        </div>
      )}
      {children}
    </section>
  );
}

// Link no canto do cartão ("Ver todas").
export function LinkDoCartao({ para, children }: { para: string; children: ReactNode }) {
  return (
    <Link
      to={para}
      className="inline-flex flex-none items-center gap-0.5 rounded-md text-sm font-bold text-primary hover:text-[#0a5242] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
      <ChevronRight className="size-4" aria-hidden="true" />
    </Link>
  );
}

// Um número em destaque. Com `para`, o cartão inteiro leva à tela daquele assunto.
export function Indicador({
  rotulo,
  valor,
  tom = 'normal',
  para,
  children,
}: {
  rotulo: string;
  valor: ReactNode;
  tom?: 'normal' | 'perigo';
  para?: string;
  children?: ReactNode;
}) {
  const conteudo = (
    <>
      <p className="text-sm font-semibold text-muted-foreground">{rotulo}</p>
      <p
        className={`mt-1.5 text-3xl font-extrabold tracking-tight tabular-nums sm:text-[2.125rem] ${
          tom === 'perigo' ? 'text-perigo' : ''
        }`}
      >
        {valor}
      </p>
      {children && <div className="mt-2 text-[13px] font-semibold text-muted-foreground">{children}</div>}
    </>
  );

  const caixa = 'block min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5';
  if (!para) return <div className={caixa}>{conteudo}</div>;
  return (
    <Link to={para} className={`${caixa} transition-colors hover:border-primary/60 hover:bg-[#fbfcfa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}>
      {conteudo}
    </Link>
  );
}

// Botões lado a lado, um escolhido (o período do painel). `aria-pressed` diz ao leitor
// de tela qual está valendo.
export function Segmentado<T extends string | number>({
  rotulo,
  opcoes,
  valor,
  aoMudar,
}: {
  rotulo: string;
  opcoes: { valor: T; rotulo: string }[];
  valor: T;
  aoMudar: (valor: T) => void;
}) {
  return (
    <div role="group" aria-label={rotulo} className="inline-flex gap-1 rounded-xl bg-muted p-1">
      {opcoes.map((opcao) => {
        const escolhido = opcao.valor === valor;
        return (
          <button
            key={String(opcao.valor)}
            type="button"
            aria-pressed={escolhido}
            onClick={() => aoMudar(opcao.valor)}
            className={`h-9 rounded-[9px] px-3.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              escolhido
                ? 'bg-card font-bold text-foreground shadow-sm'
                : 'font-semibold text-[#3a3f4a] hover:text-foreground'
            }`}
          >
            {opcao.rotulo}
          </button>
        );
      })}
    </div>
  );
}

// Barra decorativa: o número que ela representa está sempre escrito ao lado.
export function Barra({
  percentual,
  cor = 'bg-primary',
  grossa = false,
}: {
  percentual: number;
  cor?: string;
  grossa?: boolean;
}) {
  const largura = Math.max(0, Math.min(100, percentual));
  return (
    <div aria-hidden="true" className={`overflow-hidden rounded-full bg-muted ${grossa ? 'h-2.5' : 'h-1.5'}`}>
      <div className={`h-full rounded-full ${cor} transition-[width] duration-500`} style={{ width: `${largura}%` }} />
    </div>
  );
}

// Forma cinza pulsando no lugar do conteúdo que ainda vai chegar: a tela não pula
// quando ele chega, como acontecia com o spinner no meio do nada. É `span` para poder
// ocupar o lugar de um número dentro de um parágrafo.
export function Esqueleto({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-xl bg-muted ${className}`} />;
}

export function EstadoVazio({
  icone: Icone,
  titulo,
  descricao,
  children,
}: {
  icone: LucideIcon;
  titulo: string;
  descricao?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icone className="size-6" aria-hidden="true" />
      </span>
      <p className="mt-3 font-bold">{titulo}</p>
      {descricao && <p className="mt-1 max-w-md text-sm text-muted-foreground">{descricao}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function AvisoDeErro({
  mensagem,
  aoTentarDeNovo,
}: {
  mensagem: string;
  aoTentarDeNovo?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-red-200 bg-perigo-fundo px-5 py-4 text-perigo"
    >
      <AlertCircle className="size-5 flex-none" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm font-semibold">{mensagem}</p>
      {aoTentarDeNovo && (
        <button
          type="button"
          onClick={aoTentarDeNovo}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 bg-card px-3 text-sm font-semibold text-perigo hover:bg-white"
        >
          <RotateCw className="size-4" aria-hidden="true" />
          Tentar de novo
        </button>
      )}
    </div>
  );
}
