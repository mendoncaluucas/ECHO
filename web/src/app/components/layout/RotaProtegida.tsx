import { Suspense, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { LayoutGestaoSobDemanda } from '../../telasDaGestao';
import { Marca } from './Marca';
import {
  ROTA_DE_LOGIN,
  sessaoAtual,
  telaInicialDe,
  usuarioLogado,
  type Papel,
} from '../../services/api';

// Porta de todas as telas da gestão. Sem sessão, vai para o login lembrando de onde
// veio (para voltar depois de entrar). Com sessão, monta o layout com o menu.
//
// Substitui o "if (!token) navigate('/gerente/login')" que cada tela fazia por conta
// própria, cada uma com o login de um papel fixo — o administrador nem tinha o seu.
export function RotaProtegida() {
  const location = useLocation();
  const sessao = sessaoAtual();

  if (!sessao) {
    return (
      <Navigate
        to={ROTA_DE_LOGIN}
        replace
        state={{ de: location.pathname + location.search }}
      />
    );
  }

  // O menu vem sob demanda (o cliente nunca o usa). Vindo do login, já foi baixado em
  // segundo plano; aberto direto de um favorito, leva um instante, e a marca no meio
  // diz que algo está chegando, em vez de uma tela vazia.
  return (
    <Suspense
      fallback={
        <div role="status" className="flex min-h-full items-center justify-center bg-background">
          <span className="animate-pulse">
            <Marca />
          </span>
          <span className="sr-only">Carregando o Echo</span>
        </div>
      }
    >
      <LayoutGestaoSobDemanda usuario={sessao.usuario} />
    </Suspense>
  );
}

// Tela que só alguns papéis abrem. O menu já não oferece a tela a quem não pode; isto
// cobre o endereço digitado ou guardado nos favoritos.
export function ExigePapel({ papeis, children }: { papeis: Papel[]; children: ReactNode }) {
  const papel = usuarioLogado()?.papel;
  if (papel && papeis.includes(papel)) return <>{children}</>;

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
          <Lock className="size-6 text-muted-foreground" aria-hidden="true" />
        </span>
        <h1 className="text-xl font-bold">Esta tela não faz parte do seu acesso</h1>
        <p className="mt-2 text-muted-foreground">
          Se precisar dela, peça ao administrador do restaurante.
        </p>
        {papel && (
          <Link
            to={telaInicialDe(papel)}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground transition-colors hover:bg-[#0a5242]"
          >
            Ir para o meu painel
          </Link>
        )}
      </div>
    </div>
  );
}
