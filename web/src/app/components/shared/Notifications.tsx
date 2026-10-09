import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bell, BellOff, CheckCheck, Loader2 } from 'lucide-react';
import {
  avisarMudancaNasNotificacoes,
  listarNotificacoes,
  marcarNotificacao,
  marcarTodasComoLidas,
  tokenDaSessao,
  type Notificacao,
} from '../../services/api';
import { corDoTipo, haQuanto, rotuloDoStatus, rotuloDoTipo, seloDoStatus } from '../../rotulos';
import { avisarRapido } from '../../avisoRapido';
import { AvisoDeErro, CabecalhoDaPagina, Cartao, Esqueleto, EstadoVazio, Pagina } from '../layout/Pagina';

const POR_PAGINA = 20;

type Filtro = 'todas' | 'nao-lidas';

const botaoSecundario =
  'inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function Notifications() {
  const token = tokenDaSessao() ?? '';
  // A aba fica no endereço: abrir uma notificação e voltar devolve a mesma aba.
  const [busca, setBusca] = useSearchParams();
  const filtro: Filtro = busca.get('filtro') === 'nao-lidas' ? 'nao-lidas' : 'todas';
  const mudarFiltro = (novo: Filtro) =>
    setBusca(novo === 'todas' ? {} : { filtro: novo }, { replace: true });

  const [notificacoes, setNotificacoes] = useState<Notificacao[] | null>(null);
  const [total, setTotal] = useState(0);
  const [naoLidas, setNaoLidas] = useState(0);
  const [paginaCarregada, setPaginaCarregada] = useState(0);
  const [buscando, setBuscando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [marcandoTodas, setMarcandoTodas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const requisicaoAtual = useRef(0);

  // Sessão vencida (401) é tratada no serviço da API, que leva ao login.
  const carregarPagina = useCallback(
    (pagina: number) => {
      const minhaVez = ++requisicaoAtual.current;
      if (pagina === 1) setBuscando(true);
      else setCarregandoMais(true);
      setErro(null);

      listarNotificacoes(token, {
        pagina,
        porPagina: POR_PAGINA,
        ...(filtro === 'nao-lidas' && { lida: false }),
      })
        .then((res) => {
          if (minhaVez !== requisicaoAtual.current) return;
          // Feedback que chega com a tela aberta empurra a lista no servidor, e a
          // página seguinte repete o último item já mostrado. Descarta o repetido.
          setNotificacoes((anteriores) => {
            if (pagina === 1 || !anteriores) return res.itens;
            const jaNaTela = new Set(anteriores.map((n) => n.id));
            return [...anteriores, ...res.itens.filter((n) => !jaNaTela.has(n.id))];
          });
          setTotal(res.total);
          setNaoLidas(res.naoLidas);
          setPaginaCarregada(res.pagina);
        })
        .catch((e: Error) => {
          if (minhaVez === requisicaoAtual.current) {
            setErro(e.message || 'Não foi possível carregar as notificações.');
          }
        })
        .finally(() => {
          if (minhaVez !== requisicaoAtual.current) return;
          setBuscando(false);
          setCarregandoMais(false);
        });
    },
    [token, filtro]
  );

  useEffect(() => {
    carregarPagina(1);
    return () => {
      requisicaoAtual.current++;
    };
  }, [carregarPagina]);

  // Atualiza a lista na hora, sem esperar o servidor, e conserta se ele recusar.
  const aplicarLida = (id: string, lida: boolean) => {
    setNotificacoes((lista) => lista?.map((n) => (n.id === id ? { ...n, lida } : n)) ?? lista);
    setNaoLidas((contagem) => Math.max(0, contagem + (lida ? -1 : 1)));
  };

  const marcar = async (notificacao: Notificacao, lida: boolean) => {
    aplicarLida(notificacao.id, lida);
    try {
      await marcarNotificacao(notificacao.id, lida, token);
      avisarMudancaNasNotificacoes();
      // Na aba "Não lidas", a marcada sai do conjunto do servidor e a próxima página
      // pularia itens nunca mostrados. Recomeçar da primeira evita o buraco.
      if (filtro === 'nao-lidas') carregarPagina(1);
    } catch (e) {
      aplicarLida(notificacao.id, !lida);
      setErro(e instanceof Error && e.message ? e.message : 'Não foi possível marcar a notificação.');
    }
  };

  // Abrir a notificação é ler. A marcação vai junto com a navegação, sem segurá-la: se
  // falhar, a pessoa chega na ocorrência do mesmo jeito, que é o que importa. A lista é
  // atualizada na hora porque, aberta com Ctrl em outra aba, ela continua na tela.
  const aoAbrir = (notificacao: Notificacao) => {
    if (notificacao.lida) return;
    aplicarLida(notificacao.id, true);
    marcarNotificacao(notificacao.id, true, token)
      .then(avisarMudancaNasNotificacoes)
      .catch(() => aplicarLida(notificacao.id, false));
  };

  const marcarTodas = async () => {
    setMarcandoTodas(true);
    setErro(null);
    try {
      const { atualizadas } = await marcarTodasComoLidas(token);
      avisarMudancaNasNotificacoes();
      avisarRapido(
        atualizadas === 1 ? '1 notificação marcada como lida' : `${atualizadas} notificações marcadas como lidas`
      );
      carregarPagina(1);
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : 'Não foi possível marcar todas.');
    } finally {
      setMarcandoTodas(false);
    }
  };

  const haMais = notificacoes !== null && notificacoes.length < total && paginaCarregada > 0;

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo="Notificações"
        descricao={
          notificacoes === null
            ? 'Cada feedback novo que chega pelas mesas.'
            : naoLidas > 0
              ? `${naoLidas} não ${naoLidas === 1 ? 'lida' : 'lidas'}`
              : 'Tudo lido.'
        }
        acoes={
          naoLidas > 0 && (
            <button type="button" onClick={marcarTodas} disabled={marcandoTodas} className={botaoSecundario}>
              {marcandoTodas ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCheck className="size-4" aria-hidden="true" />
              )}
              Marcar todas como lidas
            </button>
          )
        }
      />

      <div role="group" aria-label="Mostrar" className="mb-4 inline-flex gap-1 rounded-xl bg-muted p-1">
        {(
          [
            ['todas', 'Todas'],
            ['nao-lidas', 'Não lidas'],
          ] as const
        ).map(([valor, rotulo]) => {
          const escolhido = filtro === valor;
          return (
            <button
              key={valor}
              type="button"
              aria-pressed={escolhido}
              onClick={() => mudarFiltro(valor)}
              className={`inline-flex h-9 items-center gap-2 rounded-[9px] px-3.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                escolhido
                  ? 'bg-card font-bold text-foreground shadow-sm'
                  : 'font-semibold text-[#3a3f4a] hover:text-foreground'
              }`}
            >
              {rotulo}
              {valor === 'nao-lidas' && naoLidas > 0 && (
                <span className="min-w-6 rounded-full bg-primary px-1.5 text-center text-xs leading-5 font-bold text-primary-foreground tabular-nums">
                  {naoLidas}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {erro && (
        <div className="mb-4">
          <AvisoDeErro mensagem={erro} aoTentarDeNovo={() => carregarPagina(1)} />
        </div>
      )}

      {notificacoes === null ? (
        !erro && (
          <Cartao>
            <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando notificações">
              {[0, 1, 2, 3].map((i) => (
                <Esqueleto key={i} className="h-16" />
              ))}
            </div>
          </Cartao>
        )
      ) : notificacoes.length === 0 ? (
        filtro === 'nao-lidas' ? (
          <EstadoVazio icone={BellOff} titulo="Nada por ler" descricao="As notificações novas aparecem aqui.">
            <button type="button" onClick={() => mudarFiltro('todas')} className={botaoSecundario}>
              Ver todas
            </button>
          </EstadoVazio>
        ) : (
          <EstadoVazio
            icone={Bell}
            titulo="Nenhuma notificação ainda"
            descricao="Cada feedback que chega pelo QR Code das mesas aparece aqui."
          />
        )
      ) : (
        <div aria-busy={buscando} className={`transition-opacity ${buscando ? 'opacity-60' : ''}`}>
          <Cartao>
            <ul className="-my-1 divide-y divide-[#efefea]">
              {notificacoes.map((n) => (
                <li key={n.id} className="flex flex-col gap-1 py-1 sm:flex-row sm:items-start sm:gap-3">
                  <ItemDaNotificacao notificacao={n} aoAbrir={() => aoAbrir(n)} />
                  {/* No celular desce para baixo do conteúdo: ao lado, espremia o texto. */}
                  <button
                    type="button"
                    onClick={() => marcar(n, !n.lida)}
                    className="mb-2 self-end rounded-md px-2 py-1 text-xs font-bold whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:mt-3 sm:mb-0 sm:self-start"
                  >
                    {n.lida ? 'Marcar como não lida' : 'Marcar como lida'}
                  </button>
                </li>
              ))}
            </ul>
          </Cartao>

          {haMais && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => carregarPagina(paginaCarregada + 1)}
                disabled={carregandoMais}
                className={botaoSecundario}
              >
                {carregandoMais && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                Carregar mais
              </button>
            </div>
          )}
        </div>
      )}
    </Pagina>
  );
}

function ItemDaNotificacao({ notificacao: n, aoAbrir }: { notificacao: Notificacao; aoAbrir: () => void }) {
  const f = n.feedback;
  return (
    <Link
      to={`/coordenador/ocorrencia/${f.id}`}
      onClick={aoAbrir}
      className="-mx-2 flex min-w-0 flex-1 gap-3.5 rounded-xl px-2 py-3 transition-colors hover:bg-[#f6f6f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className={`mt-1.5 size-2.5 flex-none rounded-full ${corDoTipo(f.tipo)}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p
          className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm ${
            n.lida ? 'font-semibold text-[#3a3f4a]' : 'font-extrabold text-foreground'
          }`}
        >
          {rotuloDoTipo(f.tipo)} · {f.area?.nome ?? 'Restaurante'}
          {/* Selo com texto, não uma segunda bolinha: ao lado da cor do tipo, dois
              pontos coloridos não diziam qual era qual. */}
          {!n.lida && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
              Nova
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${seloDoStatus(f.status)}`}>
            {rotuloDoStatus(f.status)}
          </span>
        </p>
        {f.comentario && (
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed break-words text-[#3a3f4a]">“{f.comentario}”</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {f.avaliacoes.map((a) => `${a.categoria} ${a.estrelas}★`).join(' · ')}
          {f.avaliacoes.length > 0 && ' · '}
          <time dateTime={n.criadoEm} title={new Date(n.criadoEm).toLocaleString('pt-BR')}>
            {haQuanto(n.criadoEm)}
          </time>
        </p>
      </div>
    </Link>
  );
}
