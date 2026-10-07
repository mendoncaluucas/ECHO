import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Droplet,
  EyeOff,
  Lightbulb,
  Loader2,
  Mail,
  QrCode,
  RotateCw,
  Star,
  ThumbsUp,
  TriangleAlert,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import {
  getVenue,
  submitFeedback,
  type Categoria,
  type TipoFeedback,
  type VenueContext,
} from '../../services/api';

// Avaliação do cliente, aberta pelo QR Code da mesa. Três etapas na mesma tela:
// notas → conte mais → retorno. A etapa vai no endereço (?etapa=2) para o "voltar"
// do celular voltar uma etapa em vez de sair do formulário.

const MAX_COMENTARIO = 1000;
const MAX_NOME = 100;
// A mesma regra da API (public.routes.ts): o que a tela aceita, o envio também aceita.
const EMAIL_VALIDO = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

// O servidor gratuito hiberna e leva ~20s para acordar — justo com o cliente na mesa.
// Passado este tempo, a tela explica a espera em vez de parecer travada.
const ESPERA_ANTES_DE_EXPLICAR = 4000;

const ROTULO_DA_NOTA = ['Muito ruim', 'Ruim', 'Regular', 'Bom', 'Excelente'];

type Etapa = 1 | 2 | 3;

interface Rascunho {
  notas: Record<string, number>;
  tipo: TipoFeedback | null;
  comentario: string;
  querRetorno: boolean;
  nome: string;
  email: string;
}

const RASCUNHO_VAZIO: Rascunho = {
  notas: {},
  tipo: null,
  comentario: '',
  querRetorno: false,
  nome: '',
  email: '',
};

// O rascunho sobrevive a recarregar a página (o celular faz isso sozinho às vezes),
// separado por mesa. Sai ao enviar.
const chaveDoRascunho = (qrToken: string) => `echo_avaliacao_${qrToken}`;

function lerRascunho(qrToken: string): Rascunho {
  try {
    const bruto = sessionStorage.getItem(chaveDoRascunho(qrToken));
    return bruto ? { ...RASCUNHO_VAZIO, ...JSON.parse(bruto) } : RASCUNHO_VAZIO;
  } catch {
    return RASCUNHO_VAZIO;
  }
}

function sem(texto: string) {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

const ICONE_DA_CATEGORIA: Record<string, LucideIcon> = {
  higiene: Droplet,
  atendimento: Users,
  alimento: UtensilsCrossed,
};

const TIPOS: { id: TipoFeedback; rotulo: string; icone: LucideIcon; convite: string }[] = [
  { id: 'ELOGIO', rotulo: 'Elogio', icone: ThumbsUp, convite: 'O que você mais gostou?' },
  { id: 'SUGESTAO', rotulo: 'Sugestão', icone: Lightbulb, convite: 'O que podemos melhorar?' },
  {
    id: 'RECLAMACAO',
    rotulo: 'Reclamação',
    icone: TriangleAlert,
    convite: 'O que aconteceu? Conte para a equipe resolver.',
  },
];

// Tipo já marcado ao chegar na etapa 2, pela média das notas. Só uma sugestão: o
// cliente troca com um toque, e a escolha dele nunca é sobrescrita.
function tipoPelaMedia(notas: Record<string, number>): TipoFeedback {
  const valores = Object.values(notas);
  const media = valores.reduce((a, b) => a + b, 0) / valores.length;
  if (media >= 4) return 'ELOGIO';
  if (media <= 2) return 'RECLAMACAO';
  return 'SUGESTAO';
}

const botaoPrincipal =
  'flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[17px] font-bold text-primary-foreground transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50';

const campo =
  'h-12 w-full rounded-xl border border-border bg-card px-4 text-base transition-colors placeholder:text-[#8a8f9a] focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 aria-[invalid=true]:border-red-500';

function Estrelas({
  categoria,
  valor,
  aoEscolher,
}: {
  categoria: Categoria;
  valor: number;
  aoEscolher: (nota: number) => void;
}) {
  // Prévia ao passar o mouse; no toque ela não existe e o toque já escolhe.
  const [sobre, setSobre] = useState(0);
  const mostrado = sobre || valor;

  return (
    <div
      role="radiogroup"
      aria-label={`Nota para ${categoria.nome}`}
      className="flex justify-between"
      onMouseLeave={() => setSobre(0)}
    >
      {ROTULO_DA_NOTA.map((rotulo, indice) => {
        const nota = indice + 1;
        return (
          <label
            key={nota}
            className="relative flex size-12 cursor-pointer items-center justify-center"
            onMouseEnter={() => setSobre(nota)}
          >
            {/* Botão de opção de verdade, escondido: teclado (setas) e leitor de tela
                funcionam sem nenhum código a mais. */}
            <input
              type="radio"
              name={`nota-${categoria.id}`}
              value={nota}
              checked={valor === nota}
              onChange={() => aoEscolher(nota)}
              aria-label={`${nota} ${nota === 1 ? 'estrela' : 'estrelas'}: ${rotulo}`}
              className="peer sr-only"
            />
            <span className="flex items-center justify-center rounded-full p-1 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-primary">
              <Star
                aria-hidden="true"
                className={`size-9 transition-transform duration-150 active:scale-90 ${
                  nota <= mostrado ? 'fill-estrela text-estrela' : 'fill-transparent text-[#d4d4cd]'
                } ${nota === valor ? 'scale-110' : ''}`}
              />
            </span>
          </label>
        );
      })}
    </div>
  );
}

function TelaDeAviso({
  icone,
  titulo,
  texto,
  acao,
}: {
  icone: React.ReactNode;
  titulo: string;
  texto: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-[#fdf3dc] text-[#a8590a]">
          {icone}
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight">{titulo}</h1>
        <p className="mt-2 text-muted-foreground">{texto}</p>
        {acao && <div className="mt-6">{acao}</div>}
      </div>
    </div>
  );
}

export function FeedbackForm() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qrToken = searchParams.get('t') ?? '';
  const etapaDaUrl = Number(searchParams.get('etapa'));
  const etapaPedida: Etapa = etapaDaUrl === 2 || etapaDaUrl === 3 ? etapaDaUrl : 1;

  // carregando → pronto | invalido (404) | semConexao (qualquer outra falha)
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'invalido' | 'semConexao'>(
    qrToken ? 'carregando' : 'invalido'
  );
  const [contexto, setContexto] = useState<VenueContext | null>(null);
  const [acordando, setAcordando] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  const [rascunho, setRascunho] = useState<Rascunho>(() => lerRascunho(qrToken));
  const [enviando, setEnviando] = useState(false);
  const [erroDoEnvio, setErroDoEnvio] = useState<string | null>(null);
  const [emailTocado, setEmailTocado] = useState(false);
  const titulo = useRef<HTMLHeadingElement>(null);

  // O QR pode ter deixado de valer depois de impresso (área ou código desativados).
  // Validar na abertura evita o cliente preencher tudo e só descobrir no envio.
  useEffect(() => {
    if (!qrToken) return;
    let ativo = true;
    setEstado('carregando');
    setAcordando(false);
    const relogio = window.setTimeout(() => ativo && setAcordando(true), ESPERA_ANTES_DE_EXPLICAR);

    getVenue(qrToken)
      .then((res) => {
        if (!ativo) return;
        setContexto(res);
        setEstado('pronto');
      })
      .catch((e: Error & { status?: number }) => {
        if (ativo) setEstado(e.status === 404 ? 'invalido' : 'semConexao');
      })
      .finally(() => window.clearTimeout(relogio));

    return () => {
      ativo = false;
      window.clearTimeout(relogio);
    };
  }, [qrToken, tentativa]);

  useEffect(() => {
    if (!qrToken) return;
    try {
      sessionStorage.setItem(chaveDoRascunho(qrToken), JSON.stringify(rascunho));
    } catch {
      // Sem armazenamento: só não sobrevive a recarregar.
    }
  }, [qrToken, rascunho]);

  // Só notas de categorias que existem agora: o rascunho guardado pode ter uma que saiu
  // entre começar e enviar, e a API recusaria o envio inteiro por causa dela.
  const notasValidas = Object.entries(rascunho.notas).filter(([id]) =>
    contexto?.categorias.some((c) => c.id === id)
  );
  const temNota = notasValidas.length > 0;
  // Etapa 2 ou 3 aberta sem nota (recarregou depois de enviar, link copiado): volta à 1.
  const etapa: Etapa = temNota ? etapaPedida : 1;

  // A cada etapa nova: topo da página e foco no título, para o leitor de tela
  // anunciar onde se está.
  useEffect(() => {
    if (estado !== 'pronto') return;
    window.scrollTo({ top: 0 });
    titulo.current?.focus({ preventScroll: true });
  }, [etapa, estado]);

  const mudar = (parcial: Partial<Rascunho>) => setRascunho((atual) => ({ ...atual, ...parcial }));

  const irPara = (proxima: Etapa) => {
    if (proxima === 2 && !rascunho.tipo) {
      mudar({ tipo: tipoPelaMedia(Object.fromEntries(notasValidas)) });
    }
    setErroDoEnvio(null);
    setSearchParams({ t: qrToken, etapa: String(proxima) });
  };

  // Volta pelo histórico quando a etapa anterior está nele, para o "voltar" do botão e
  // o do celular andarem juntos. Aberta já na etapa 2 (página recarregada), não há
  // para onde voltar no histórico, e ir para trás tiraria o cliente do formulário.
  const voltar = () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else setSearchParams({ t: qrToken, etapa: String(etapa - 1) }, { replace: true });
  };

  const emailInvalido =
    rascunho.querRetorno && !EMAIL_VALIDO.test(rascunho.email.trim());

  // No celular, o "ir" do teclado ao terminar o e-mail é o jeito natural de enviar.
  const enviarComEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !enviando) {
      e.preventDefault();
      setEmailTocado(true);
      void enviar();
    }
  };

  const enviar = async () => {
    if (!contexto || !rascunho.tipo) return;
    if (emailInvalido) {
      setEmailTocado(true);
      return;
    }

    setEnviando(true);
    setErroDoEnvio(null);
    try {
      await submitFeedback({
        qrToken,
        tipo: rascunho.tipo,
        comentario: rascunho.comentario.trim() || undefined,
        anonimo: !rascunho.querRetorno,
        contatoNome: rascunho.querRetorno ? rascunho.nome.trim() || null : null,
        contatoEmail: rascunho.querRetorno ? rascunho.email.trim() : null,
        avaliacoes: notasValidas.map(([categoriaId, estrelas]) => ({
          categoriaId,
          estrelas,
        })),
      });
      try {
        sessionStorage.removeItem(chaveDoRascunho(qrToken));
      } catch {
        // nada a limpar
      }
      // replace: o "voltar" depois do envio não reabre o formulário preenchido.
      navigate('/sucesso', {
        replace: true,
        state: { qrToken, comRetorno: rascunho.querRetorno },
      });
    } catch (e) {
      const falha = e as Error & { status?: number };
      setErroDoEnvio(
        falha.status === 404
          ? 'Este QR Code não está mais ativo. Peça ajuda a um atendente.'
          : falha.status === 400
            ? falha.message
            : 'Não foi possível enviar agora. Suas respostas estão guardadas: tente de novo.'
      );
    } finally {
      setEnviando(false);
    }
  };

  if (estado === 'invalido') {
    return (
      <TelaDeAviso
        icone={<QrCode className="size-8" aria-hidden="true" />}
        titulo="QR Code não identificado"
        texto="Aponte a câmera do celular para o QR Code da sua mesa para deixar a sua avaliação."
      />
    );
  }

  if (estado === 'semConexao') {
    return (
      <TelaDeAviso
        icone={<RotateCw className="size-8" aria-hidden="true" />}
        titulo="Não conseguimos abrir a avaliação"
        texto="A conexão falhou. Verifique a internet do celular e tente de novo."
        acao={
          <button type="button" onClick={() => setTentativa((n) => n + 1)} className={botaoPrincipal}>
            Tentar de novo
          </button>
        }
      />
    );
  }

  if (estado === 'carregando' || !contexto) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
        <p role="status" className="max-w-xs text-muted-foreground">
          {acordando
            ? 'Só um instante: estamos preparando a sua avaliação.'
            : 'Carregando…'}
        </p>
      </div>
    );
  }

  const tipoAtual = TIPOS.find((t) => t.id === rascunho.tipo) ?? TIPOS[1];

  return (
    <div className="flex min-h-full justify-center bg-background">
      <div className="flex w-full max-w-md flex-col">
        <header className="flex flex-col gap-5 px-6 pt-7">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-10 flex-none items-center justify-center rounded-xl bg-marca-escura text-base font-extrabold text-white"
              >
                {contexto.venue.nome.replace(/^restaurante\s+/i, '').charAt(0).toUpperCase()}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-extrabold">{contexto.venue.nome}</span>
                <span className="truncate text-sm text-muted-foreground">{contexto.area.nome}</span>
              </div>
            </div>
            <span className="flex-none text-sm font-bold text-muted-foreground">
              {etapa} de 3
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={`Etapa ${etapa} de 3`}
            aria-valuemin={1}
            aria-valuemax={3}
            aria-valuenow={etapa}
            className="flex gap-1.5"
          >
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                  n <= etapa ? 'bg-primary' : 'bg-[#e2e2dc]'
                }`}
              />
            ))}
          </div>
        </header>

        <main key={etapa} className="flex-1 px-6 pt-7 pb-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {etapa === 1 && (
            <section className="flex flex-col gap-6">
              <div>
                <h1 ref={titulo} tabIndex={-1} className="text-[28px] leading-tight font-extrabold tracking-tight focus:outline-none">
                  Como foi a sua experiência?
                </h1>
                <p className="mt-2 text-muted-foreground">
                  Toque nas estrelas. Leva menos de um minuto e vai direto para a equipe.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                {contexto.categorias.map((categoria) => {
                  const nota = rascunho.notas[categoria.id] ?? 0;
                  const Icone = ICONE_DA_CATEGORIA[sem(categoria.nome)] ?? Star;
                  return (
                    <fieldset
                      key={categoria.id}
                      className={`rounded-2xl border bg-card p-4 transition-colors ${
                        nota > 0 ? 'border-primary/40' : 'border-border'
                      }`}
                    >
                      <legend className="sr-only">{categoria.nome}</legend>
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-accent text-accent-foreground">
                          <Icone className="size-[18px]" aria-hidden="true" />
                        </span>
                        <span className="font-bold" aria-hidden="true">
                          {categoria.nome}
                        </span>
                        <span className="ml-auto text-sm font-semibold">
                          {nota > 0 ? (
                            <span className="flex items-center gap-2">
                              <span className="text-primary">{ROTULO_DA_NOTA[nota - 1]}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const { [categoria.id]: _, ...resto } = rascunho.notas;
                                  mudar({ notas: resto });
                                }}
                                className="rounded-md px-1.5 py-0.5 text-xs text-muted-foreground underline-offset-2 hover:underline"
                                aria-label={`Tirar a nota de ${categoria.nome}`}
                              >
                                limpar
                              </button>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Opcional</span>
                          )}
                        </span>
                      </div>
                      <div className="mt-2">
                        <Estrelas
                          categoria={categoria}
                          valor={nota}
                          aoEscolher={(n) => mudar({ notas: { ...rascunho.notas, [categoria.id]: n } })}
                        />
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            </section>
          )}

          {etapa === 2 && (
            <section className="flex flex-col gap-6">
              <div>
                <h1 ref={titulo} tabIndex={-1} className="text-[28px] leading-tight font-extrabold tracking-tight focus:outline-none">
                  Quer contar mais?
                </h1>
                <p className="mt-2 text-muted-foreground">Escolha o tipo e, se quiser, escreva.</p>
              </div>

              <div role="radiogroup" aria-label="Tipo de avaliação" className="grid grid-cols-3 gap-2">
                {TIPOS.map((tipo) => {
                  const Icone = tipo.icone;
                  const marcado = rascunho.tipo === tipo.id;
                  return (
                    <label
                      key={tipo.id}
                      className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border px-2 py-4 text-sm font-bold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary ${
                        marcado
                          ? 'border-primary bg-accent text-accent-foreground'
                          : 'border-border bg-card text-foreground'
                      }`}
                    >
                      <input
                        type="radio"
                        name="tipo"
                        value={tipo.id}
                        checked={marcado}
                        onChange={() => mudar({ tipo: tipo.id })}
                        className="sr-only"
                      />
                      <Icone className="size-6" aria-hidden="true" />
                      {tipo.rotulo}
                    </label>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="comentario" className="font-bold">
                  {tipoAtual.convite}
                </label>
                <textarea
                  id="comentario"
                  value={rascunho.comentario}
                  maxLength={MAX_COMENTARIO}
                  onChange={(e) => mudar({ comentario: e.target.value })}
                  rows={5}
                  placeholder="Escreva aqui (opcional)"
                  className="w-full resize-none rounded-2xl border border-border bg-card px-4 py-3 text-base leading-relaxed placeholder:text-[#8a8f9a] focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20"
                />
                <span className="self-end text-xs text-muted-foreground">
                  {rascunho.comentario.length}/{MAX_COMENTARIO}
                </span>
              </div>
            </section>
          )}

          {etapa === 3 && (
            <section className="flex flex-col gap-6">
              <div>
                <h1 ref={titulo} tabIndex={-1} className="text-[28px] leading-tight font-extrabold tracking-tight focus:outline-none">
                  Quer uma resposta da equipe?
                </h1>
                <p className="mt-2 text-muted-foreground">
                  Você escolhe. Sem identificação, a avaliação chega do mesmo jeito.
                </p>
              </div>

              <div role="radiogroup" aria-label="Retorno da equipe" className="flex flex-col gap-3">
                {[
                  {
                    valor: false,
                    icone: EyeOff,
                    titulo: 'Prefiro ficar anônimo',
                    texto: 'Ninguém fica sabendo quem avaliou.',
                  },
                  {
                    valor: true,
                    icone: Mail,
                    titulo: 'Quero que me respondam',
                    texto: 'A equipe pode te escrever sobre esta avaliação.',
                  },
                ].map((opcao) => {
                  const Icone = opcao.icone;
                  const marcado = rascunho.querRetorno === opcao.valor;
                  return (
                    <label
                      key={String(opcao.valor)}
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary ${
                        marcado ? 'border-primary bg-accent' : 'border-border bg-card'
                      }`}
                    >
                      <input
                        type="radio"
                        name="retorno"
                        checked={marcado}
                        onChange={() => mudar({ querRetorno: opcao.valor })}
                        className="sr-only"
                      />
                      <Icone
                        className={`mt-0.5 size-5 flex-none ${marcado ? 'text-accent-foreground' : 'text-muted-foreground'}`}
                        aria-hidden="true"
                      />
                      <span className="flex flex-col">
                        <span className="font-bold">{opcao.titulo}</span>
                        <span className="text-sm text-muted-foreground">{opcao.texto}</span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {rascunho.querRetorno && (
                <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="nome" className="text-sm font-semibold">
                      Como podemos te chamar? <span className="font-normal text-muted-foreground">(opcional)</span>
                    </label>
                    <input
                      id="nome"
                      type="text"
                      autoComplete="name"
                      maxLength={MAX_NOME}
                      value={rascunho.nome}
                      onChange={(e) => mudar({ nome: e.target.value })}
                      enterKeyHint="next"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          document.getElementById('email')?.focus();
                        }
                      }}
                      placeholder="Seu nome"
                      className={campo}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="email" className="text-sm font-semibold">
                      E-mail para a resposta
                    </label>
                    <input
                      id="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      maxLength={254}
                      value={rascunho.email}
                      onChange={(e) => mudar({ email: e.target.value })}
                      onBlur={() => setEmailTocado(true)}
                      onKeyDown={enviarComEnter}
                      enterKeyHint="send"
                      placeholder="voce@email.com"
                      aria-invalid={emailTocado && emailInvalido}
                      aria-describedby="email-ajuda"
                      className={campo}
                    />
                    <span
                      id="email-ajuda"
                      className={`text-[13px] ${emailTocado && emailInvalido ? 'text-red-700' : 'text-muted-foreground'}`}
                    >
                      {emailTocado && emailInvalido
                        ? 'Confira o e-mail: ele precisa ter o formato nome@exemplo.com.'
                        : 'Seu nome e e-mail só aparecem para a equipe que for responder, e só para isso.'}
                    </span>
                  </div>
                </div>
              )}
            </section>
          )}
        </main>

        <footer className="sticky bottom-0 flex flex-col gap-3 bg-background/95 px-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] backdrop-blur">
          {erroDoEnvio && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {erroDoEnvio}
            </p>
          )}

          <div className="flex gap-3">
            {etapa > 1 && (
              <button
                type="button"
                onClick={voltar}
                aria-label="Voltar para a etapa anterior"
                className="flex size-14 flex-none items-center justify-center rounded-2xl border border-border bg-card text-foreground transition hover:bg-muted"
              >
                <ArrowLeft className="size-5" />
              </button>
            )}

            {etapa === 1 && (
              <button type="button" onClick={() => irPara(2)} disabled={!temNota} className={botaoPrincipal}>
                Continuar
              </button>
            )}
            {etapa === 2 && (
              <button type="button" onClick={() => irPara(3)} className={botaoPrincipal}>
                Continuar
              </button>
            )}
            {etapa === 3 && (
              <button type="button" onClick={enviar} disabled={enviando} className={botaoPrincipal}>
                {enviando && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
                {enviando ? 'Enviando…' : 'Enviar avaliação'}
              </button>
            )}
          </div>

          <p className="text-center text-[13px] text-muted-foreground">
            {etapa === 1 && !temNota
              ? 'Avalie ao menos uma categoria para continuar.'
              : 'Anônimo por padrão. Seus dados só são pedidos se você quiser resposta.'}
          </p>
        </footer>
      </div>
    </div>
  );
}
