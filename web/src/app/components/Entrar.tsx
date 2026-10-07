import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, QrCode } from 'lucide-react';
import { Marca } from './layout/Marca';
import { papelPodeAbrir } from '../navegacao';
import {
  lerAvisoDoLogin,
  login,
  salvarSessao,
  sessaoAtual,
  telaInicialDe,
} from '../services/api';

// O servidor gratuito do Render hiberna e leva ~20s para acordar. Passado este tempo
// sem resposta, a tela explica a espera em vez de parecer travada.
const ESPERA_ANTES_DE_EXPLICAR = 4000;

const campo =
  'h-12 w-full rounded-xl border border-border bg-input-background px-4 text-base transition-colors placeholder:text-[#8a8f9a] focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20';

// Tela inicial do sistema: o login único da equipe. Cada papel cai direto no próprio
// painel. Substitui a antiga escolha de papel, cujo cartão "Cliente" levava a um
// formulário que não funciona sem o QR da mesa.
export function Entrar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [demorando, setDemorando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Motivo de ter caído aqui (sessão vencida, por exemplo). Lido uma vez.
  const [aviso] = useState(() => lerAvisoDoLogin());
  const relogio = useRef<number>();

  useEffect(() => () => window.clearTimeout(relogio.current), []);

  // Quem já está logado e abre a raiz vai direto ao próprio painel.
  const sessao = sessaoAtual();
  if (sessao) return <Navigate to={telaInicialDe(sessao.usuario.papel)} replace />;

  // Tela onde a sessão caiu, para voltar a ela depois de entrar.
  const de = (location.state as { de?: string } | null)?.de;

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    relogio.current = window.setTimeout(() => setDemorando(true), ESPERA_ANTES_DE_EXPLICAR);

    try {
      const { token, usuario } = await login(email.trim(), senha);
      salvarSessao(token, usuario);

      // Volta à tela de antes só se o papel puder abri-la: quem entra com outra conta
      // não deve cair numa tela de "acesso restrito".
      const caminho = de?.split('?')[0];
      const destino =
        de && caminho && papelPodeAbrir(usuario.papel, caminho) ? de : telaInicialDe(usuario.papel);
      navigate(destino, { replace: true });
    } catch (falha) {
      const status = (falha as { status?: number }).status;
      // 401 é credencial errada; qualquer outra coisa (API fora, rede) merece mensagem
      // própria, senão a pessoa procura o problema na senha.
      setErro(
        status === 401
          ? 'E-mail ou senha incorretos.'
          : 'Não foi possível conectar ao servidor. Tente de novo em alguns instantes.'
      );
      setEnviando(false);
    } finally {
      window.clearTimeout(relogio.current);
      setDemorando(false);
    }
  };

  return (
    <div className="flex min-h-full flex-wrap bg-background text-foreground">
      <section className="hidden min-w-0 flex-[1_1_480px] flex-col justify-between gap-12 bg-marca-escura px-16 py-14 text-[#f2f5f3] lg:flex">
        <Marca escura />

        <div className="max-w-[480px]">
          <p className="mb-4 text-sm font-semibold tracking-[0.08em] text-[#8fd9c2] uppercase">
            Restaurante Sinuelo
          </p>
          <h1 className="text-5xl leading-[1.08] font-extrabold tracking-tight">
            Cada opinião da mesa chega até quem pode resolver.
          </h1>
          <p className="mt-5 text-[17px] leading-relaxed text-[#b9c7c1]">
            O cliente avalia pelo QR Code da mesa. A equipe recebe na hora, trata e acompanha a
            evolução de cada setor.
          </p>
        </div>

        <ul className="flex flex-wrap gap-3">
          {['Notificação a cada feedback', 'Tratativa por ocorrência', 'Relatórios por mês'].map(
            (texto) => (
              <li key={texto} className="rounded-full bg-white/8 px-3.5 py-2 text-sm font-semibold">
                {texto}
              </li>
            )
          )}
        </ul>
      </section>

      <section className="flex min-w-0 flex-[1_1_420px] items-center justify-center px-6 py-14">
        <form onSubmit={entrar} className="flex w-full max-w-[380px] flex-col gap-5" noValidate>
          <div className="mb-2 lg:hidden">
            <Marca legenda="Restaurante Sinuelo" />
          </div>

          <div>
            <h2 className="text-3xl font-extrabold tracking-tight">Bem-vindo ao Echo</h2>
            <p className="mt-2 text-muted-foreground">
              Entre com a conta da equipe. Você vai direto para o seu painel.
            </p>
          </div>

          {aviso && (
            <p
              role="status"
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            >
              {aviso}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-semibold">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@sinuelo.com"
              className={campo}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="senha" className="text-sm font-semibold">
              Senha
            </label>
            <div className="relative">
              <input
                id="senha"
                type={mostrarSenha ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Sua senha"
                className={`${campo} pr-12`}
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((v) => !v)}
                aria-label={mostrarSenha ? 'Esconder a senha' : 'Mostrar a senha'}
                aria-pressed={mostrarSenha}
                className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
              >
                {mostrarSenha ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
            <span className="text-[13px] text-muted-foreground">
              Esqueceu a senha? O administrador do restaurante redefine para você.
            </span>
          </div>

          {erro && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando || email.trim() === '' || senha === ''}
            className="flex h-[52px] items-center justify-center gap-2 rounded-xl bg-primary font-bold text-primary-foreground transition-colors hover:bg-[#0a5242] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enviando && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>

          {demorando && (
            <p role="status" className="text-center text-sm text-muted-foreground">
              O servidor está acordando. A primeira entrada do dia pode levar até meio minuto.
            </p>
          )}

          <div className="flex items-start gap-3 rounded-xl bg-[#eef2ef] px-4 py-3.5 text-sm leading-relaxed text-[#3e4a45]">
            <QrCode className="mt-0.5 size-[18px] flex-none" aria-hidden="true" />
            <span>É cliente? Aponte a câmera do celular para o QR Code da sua mesa.</span>
          </div>
        </form>
      </section>
    </div>
  );
}
