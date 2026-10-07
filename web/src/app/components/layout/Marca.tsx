// Logo do Echo: ondas saindo de um ponto, o eco da opinião do cliente.

export function IconeDaMarca({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 12a8 8 0 0 1 8-8" />
      <path d="M8 12a4 4 0 0 1 4-4" />
      <circle cx="12" cy="12" r="1.5" />
      <path d="M12 20a8 8 0 0 0 8-8" />
    </svg>
  );
}

// `escura`: para fundo escuro (o painel do login). O padrão é para fundo claro.
export function Marca({ escura = false, legenda }: { escura?: boolean; legenda?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={
          escura
            ? 'flex size-9 flex-none items-center justify-center rounded-[10px] bg-[#2bb58f] text-marca-escura'
            : 'flex size-9 flex-none items-center justify-center rounded-[10px] bg-primary text-primary-foreground'
        }
      >
        <IconeDaMarca className="size-5" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-lg font-extrabold tracking-tight">echo</span>
        {legenda && (
          <span className={escura ? 'text-xs text-[#b9c7c1]' : 'text-xs text-muted-foreground'}>
            {legenda}
          </span>
        )}
      </span>
    </div>
  );
}
