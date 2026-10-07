import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Ban,
  Check,
  Copy,
  Download,
  Loader2,
  Maximize,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
  X,
} from 'lucide-react';
import { IconeDaMarca } from '../layout/Marca';
import {
  atualizarQRCode,
  gerarQRCode,
  listarAreas,
  listarQRCodes,
  tokenDaSessao,
  urlDaImagemDoQR,
  type Area,
  type QRCodeCadastrado,
} from '../../services/api';

// QR Codes por área: ver os códigos de cada mesa, apresentar na tela (demonstração),
// imprimir o cartão de mesa, baixar, copiar o link, desativar o perdido e substituir.

function dataBr(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR');
}

// "Mesa 12" → "mesa-12", para o nome do arquivo baixado.
function slug(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const botaoSecundario =
  'inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50';

// Tela cheia só com o código, o nome da mesa e a instrução: é o que vai no projetor
// na demonstração, e serve para o cliente escanear da tela do caixa.
function Apresentacao({
  qr,
  restaurante,
  aoFechar,
}: {
  qr: QRCodeCadastrado;
  restaurante: string;
  aoFechar: () => void;
}) {
  const fechar = useRef<HTMLButtonElement>(null);

  // Ao fechar, o foco volta ao botão que abriu: quem navega pelo teclado não
  // recomeça do topo da página. Vem antes do efeito abaixo, que move o foco.
  useEffect(() => {
    const quemAbriu = document.activeElement;
    return () => {
      if (quemAbriu instanceof HTMLElement) quemAbriu.focus();
    };
  }, []);

  useEffect(() => {
    fechar.current?.focus();
    const comTecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', comTecla);
    return () => window.removeEventListener('keydown', comTecla);
  }, [aoFechar]);

  const telaCheia = () => {
    document.documentElement.requestFullscreen?.().catch(() => {
      // Navegador sem tela cheia: a apresentação já ocupa a janela toda.
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`QR Code de ${qr.area.nome}`}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white p-6 text-center animate-in fade-in duration-200"
    >
      <div className="absolute top-4 right-4 flex gap-2">
        <button type="button" onClick={telaCheia} className={botaoSecundario}>
          <Maximize className="size-4" aria-hidden="true" />
          Tela cheia
        </button>
        <button
          ref={fechar}
          type="button"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            aoFechar();
          }}
          className={botaoSecundario}
        >
          <X className="size-4" aria-hidden="true" />
          Fechar
        </button>
      </div>

      <p className="text-lg font-semibold tracking-wide text-muted-foreground uppercase">
        {restaurante}
      </p>
      <img
        src={urlDaImagemDoQR(qr.token)}
        alt={`QR Code de ${qr.area.nome}`}
        className="size-[min(62vh,82vw)]"
      />
      <div>
        <p className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Aponte a câmera do celular
        </p>
        <p className="mt-2 text-xl text-muted-foreground">
          e avalie a sua experiência · <span className="font-semibold text-foreground">{qr.area.nome}</span>
        </p>
      </div>
    </div>
  );
}

// Cartão para a mesa, no tamanho A6 (meia folha A5), com linha de corte. Só aparece
// na impressão; na tela a página segue normal.
function CartaoDeMesa({
  qr,
  restaurante,
  aoCarregar,
}: {
  qr: QRCodeCadastrado;
  restaurante: string;
  aoCarregar: () => void;
}) {
  return (
    <div className="hidden print:flex print:min-h-screen print:items-center print:justify-center">
      <div className="flex h-[148mm] w-[105mm] flex-col items-center justify-between border border-dashed border-[#9aa0a6] px-[10mm] py-[12mm] text-center text-[#16181d]">
        <div>
          <p className="text-[11pt] font-semibold tracking-wide uppercase">{restaurante}</p>
          <p className="mt-[3mm] text-[22pt] leading-tight font-extrabold">Avalie a sua experiência</p>
        </div>
        <img
          src={urlDaImagemDoQR(qr.token)}
          alt=""
          onLoad={aoCarregar}
          onError={aoCarregar}
          className="size-[64mm]"
        />
        <div>
          <p className="text-[12pt] font-semibold">Aponte a câmera do celular para o código</p>
          <p className="mt-[2mm] text-[10pt]">Leva menos de um minuto · anônimo se você preferir</p>
          <p className="mt-[5mm] flex items-center justify-center gap-[2mm] text-[10pt] font-bold">
            <IconeDaMarca className="size-[4mm]" />
            {qr.area.nome}
          </p>
        </div>
      </div>
    </div>
  );
}

// Confirmação dentro do próprio cartão: o que ela desfaz (um QR impresso parando de
// funcionar) merece uma segunda pergunta, mas não um diálogo cobrindo a tela.
function Confirmacao({
  texto,
  rotulo,
  ocupado,
  aoConfirmar,
  aoCancelar,
}: {
  texto: string;
  rotulo: string;
  ocupado: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  return (
    <div role="alertdialog" aria-label={rotulo} className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm text-amber-900">{texto}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={aoConfirmar}
          disabled={ocupado}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-amber-700 px-4 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
        >
          {ocupado && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {rotulo}
        </button>
        <button type="button" onClick={aoCancelar} disabled={ocupado} className={botaoSecundario}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

type Pendente = { tipo: 'desativar'; qr: QRCodeCadastrado } | { tipo: 'substituir'; areaId: string };

function CartaoDaArea({
  area,
  codigos,
  ocupado,
  falha,
  aoFalhar,
  pendente,
  aoPedir,
  aoCancelar,
  aoGerar,
  aoMudarSituacao,
  aoApresentar,
  aoImprimir,
}: {
  area: Area;
  codigos: QRCodeCadastrado[];
  ocupado: boolean;
  falha: string | null;
  // null limpa o aviso: a ação seguinte deu certo ou foi cancelada.
  aoFalhar: (mensagem: string | null) => void;
  pendente: Pendente | null;
  aoPedir: (p: Pendente) => void;
  aoCancelar: () => void;
  aoGerar: (substituir: boolean) => void;
  aoMudarSituacao: (qr: QRCodeCadastrado, ativo: boolean) => void;
  aoApresentar: (qr: QRCodeCadastrado) => void;
  aoImprimir: (qr: QRCodeCadastrado) => void;
}) {
  const ativos = codigos.filter((q) => q.ativo);
  const inativos = codigos.filter((q) => !q.ativo);
  const principal = ativos[0];
  const [copiado, setCopiado] = useState(false);
  const [baixando, setBaixando] = useState(false);

  const copiar = async () => {
    if (!principal) return;
    try {
      await navigator.clipboard.writeText(principal.url);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de área de transferência: o link continua visível no cartão.
    }
  };

  // A imagem vem de outro endereço (a API), e o atributo `download` não vale entre
  // endereços diferentes: o navegador abriria a imagem em vez de baixar. Por isso o
  // arquivo é buscado e entregue pelo próprio site.
  const baixar = async () => {
    if (!principal) return;
    setBaixando(true);
    aoFalhar(null);
    try {
      const resposta = await fetch(urlDaImagemDoQR(principal.token, 'png', 1024));
      // Sem isso, um código desativado em outra aba baixaria o JSON do erro como .png.
      if (!resposta.ok) throw new Error();
      const blob = await resposta.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `qr-${slug(area.nome)}.png`;
      link.click();
      // Revogar no mesmo instante cancela o download em alguns navegadores.
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch {
      aoFalhar('Não foi possível baixar a imagem. Atualize a página e tente de novo.');
    } finally {
      setBaixando(false);
    }
  };

  return (
    // min-w-0: item de grade não encolhe abaixo do próprio conteúdo, e o link longo do QR
    // (que deveria cortar com reticências) empurrava o cartão para fora da tela do celular.
    <article className="min-w-0 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">{area.nome}</h2>
          <p className="text-sm text-muted-foreground">
            {principal ? `Código desde ${dataBr(principal.criadoEm)}` : 'Sem código ativo'}
          </p>
        </div>
        {principal ? (
          <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground">
            Ativo
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
            Sem código
          </span>
        )}
      </div>

      {/* No próprio cartão: com muitas mesas, um aviso no topo da página passaria despercebido. */}
      {falha && (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          {falha}
        </p>
      )}

      {principal ? (
        <>
          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              onClick={() => aoApresentar(principal)}
              aria-label={`Mostrar o QR Code de ${area.nome} em tamanho grande`}
              className="flex-none rounded-xl border border-border bg-white p-1.5 transition hover:border-primary"
            >
              <img
                src={urlDaImagemDoQR(principal.token)}
                alt=""
                loading="lazy"
                className="size-24"
              />
            </button>
            <div className="min-w-0 text-sm">
              <p className="text-muted-foreground">Leva para</p>
              <p className="truncate font-mono text-xs" title={principal.url}>
                {principal.url}
              </p>
            </div>
          </div>

          {ativos.length > 1 && (
            <p className="mt-4 flex gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <TriangleAlert className="mt-0.5 size-4 flex-none" aria-hidden="true" />
              Esta área tem {ativos.length} códigos valendo ao mesmo tempo. Substitua para ficar com
              um só.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => aoApresentar(principal)} className={botaoSecundario}>
              <Maximize className="size-4" aria-hidden="true" />
              Apresentar
            </button>
            <button type="button" onClick={() => aoImprimir(principal)} className={botaoSecundario}>
              <Printer className="size-4" aria-hidden="true" />
              Imprimir cartão
            </button>
            <button type="button" onClick={baixar} disabled={baixando} className={botaoSecundario}>
              {baixando ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="size-4" aria-hidden="true" />
              )}
              Baixar PNG
            </button>
            <button type="button" onClick={copiar} className={botaoSecundario}>
              {copiado ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              <span aria-live="polite">{copiado ? 'Link copiado' : 'Copiar link'}</span>
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => aoPedir({ tipo: 'substituir', areaId: area.id })}
              disabled={ocupado}
              className="inline-flex items-center gap-1.5 py-1 text-sm font-semibold text-accent-foreground hover:underline disabled:opacity-50"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Substituir por um novo
            </button>
            <button
              type="button"
              onClick={() => aoPedir({ tipo: 'desativar', qr: principal })}
              disabled={ocupado}
              className="inline-flex items-center gap-1.5 py-1 text-sm font-semibold text-red-700 hover:underline disabled:opacity-50"
            >
              <Ban className="size-3.5" aria-hidden="true" />
              Desativar
            </button>
          </div>

          {pendente?.tipo === 'substituir' && pendente.areaId === area.id && (
            <Confirmacao
              texto={`O código atual de ${area.nome} vai parar de funcionar na hora. Troque os cartões impressos com ele pelo novo.`}
              rotulo="Substituir"
              ocupado={ocupado}
              aoConfirmar={() => aoGerar(true)}
              aoCancelar={aoCancelar}
            />
          )}
          {pendente?.tipo === 'desativar' && pendente.qr.area.id === area.id && (
            <Confirmacao
              texto={`Quem escanear este código de ${area.nome} vai ver "QR Code não identificado". Use para um cartão perdido ou estragado.`}
              rotulo="Desativar"
              ocupado={ocupado}
              aoConfirmar={() => aoMudarSituacao(pendente.qr, false)}
              aoCancelar={aoCancelar}
            />
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => aoGerar(false)}
          disabled={ocupado}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground transition-colors hover:bg-[#0a5242] disabled:opacity-60"
        >
          {ocupado ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
          Gerar código
        </button>
      )}

      {inativos.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold text-muted-foreground">
            Códigos desativados ({inativos.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {inativos.map((qr) => (
              <li key={qr.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2">
                <span className="text-muted-foreground">
                  <span className="font-mono text-xs">{qr.token}</span> · de {dataBr(qr.criadoEm)}
                </span>
                <button
                  type="button"
                  onClick={() => aoMudarSituacao(qr, true)}
                  disabled={ocupado}
                  className="inline-flex items-center gap-1.5 font-semibold text-accent-foreground hover:underline disabled:opacity-50"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  Reativar
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

export function QRGenerator() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [codigos, setCodigos] = useState<QRCodeCadastrado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // Erro de uma ação aparece no cartão da área onde ela foi feita.
  const [falha, setFalha] = useState<{ areaId: string; mensagem: string } | null>(null);
  const [ocupadoEm, setOcupadoEm] = useState<string | null>(null);
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [apresentando, setApresentando] = useState<QRCodeCadastrado | null>(null);
  const [imprimindo, setImprimindo] = useState<QRCodeCadastrado | null>(null);
  const requisicaoAtual = useRef(0);

  const token = tokenDaSessao() ?? '';

  const carregar = useCallback(() => {
    const minhaVez = ++requisicaoAtual.current;
    Promise.all([listarAreas(), listarQRCodes(token)])
      .then(([resAreas, resCodigos]) => {
        if (minhaVez !== requisicaoAtual.current) return;
        setErro(null);
        // Só áreas ativas: código de área desativada não abre o formulário.
        setAreas(resAreas.itens.filter((a) => a.ativo));
        setCodigos(resCodigos.itens);
      })
      .catch((e: Error) => {
        if (minhaVez === requisicaoAtual.current) {
          setErro(e.message || 'Não foi possível carregar os QR Codes.');
        }
      })
      .finally(() => {
        if (minhaVez === requisicaoAtual.current) setCarregando(false);
      });
  }, [token]);

  useEffect(() => {
    carregar();
    return () => {
      requisicaoAtual.current++;
    };
  }, [carregar]);

  // Impressão: o cartão entra na página, e só depois de a imagem carregar o navegador
  // abre a janela de imprimir (senão o QR sairia em branco no papel).
  useEffect(() => {
    const limpar = () => setImprimindo(null);
    window.addEventListener('afterprint', limpar);
    return () => window.removeEventListener('afterprint', limpar);
  }, []);

  const executar = async (areaId: string, acao: () => Promise<unknown>) => {
    setFalha(null);
    setOcupadoEm(areaId);
    try {
      await acao();
      setPendente(null);
      carregar();
    } catch (e) {
      setFalha({
        areaId,
        mensagem: e instanceof Error && e.message ? e.message : 'Não foi possível concluir.',
      });
    } finally {
      setOcupadoEm(null);
    }
  };

  // Estável: a apresentação registra o Esc e põe o foco no "Fechar" ao abrir; uma
  // função nova a cada atualização da lista refaria isso e roubaria o foco.
  const fecharApresentacao = useCallback(() => setApresentando(null), []);

  const restauranteDe = (areaId: string) =>
    areas.find((a) => a.id === areaId)?.venue.nome ?? 'Restaurante Sinuelo';

  return (
    <div className="mx-auto max-w-5xl p-4 pb-10 sm:p-6 lg:p-8">
      <div className="print:hidden">
        <header className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">QR Codes</h1>
          <p className="mt-1 text-muted-foreground">
            Cada mesa ou área tem o seu código. O cliente escaneia e avalia.
          </p>
        </header>

        {erro && (
          <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {erro}
          </p>
        )}

        {carregando ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-busy="true" aria-label="Carregando QR Codes">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-56 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : areas.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <QrCode className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 font-bold">Nenhuma área ativa ainda</p>
            <p className="mt-1 text-muted-foreground">
              Cadastre as mesas e áreas do restaurante para gerar os códigos.
            </p>
            <Link
              to="/admin/configuracoes"
              className="mt-5 inline-flex h-11 items-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:bg-[#0a5242]"
            >
              Cadastrar áreas
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {areas.map((area) => (
              <CartaoDaArea
                key={area.id}
                area={area}
                codigos={codigos.filter((q) => q.area.id === area.id)}
                ocupado={ocupadoEm === area.id}
                falha={falha?.areaId === area.id ? falha.mensagem : null}
                aoFalhar={(mensagem) => setFalha(mensagem ? { areaId: area.id, mensagem } : null)}
                pendente={pendente}
                aoPedir={setPendente}
                aoCancelar={() => {
                  setPendente(null);
                  setFalha(null);
                }}
                aoGerar={(substituir) =>
                  executar(area.id, () =>
                    gerarQRCode(area.id, token, { desativarAnteriores: substituir })
                  )
                }
                aoMudarSituacao={(qr, ativo) =>
                  executar(area.id, () => atualizarQRCode(qr.id, ativo, token))
                }
                aoApresentar={setApresentando}
                aoImprimir={setImprimindo}
              />
            ))}
          </div>
        )}
      </div>

      {apresentando && (
        <Apresentacao
          qr={apresentando}
          restaurante={restauranteDe(apresentando.area.id)}
          aoFechar={fecharApresentacao}
        />
      )}

      {imprimindo && (
        <CartaoDeMesa
          qr={imprimindo}
          restaurante={restauranteDe(imprimindo.area.id)}
          aoCarregar={() => window.print()}
        />
      )}
    </div>
  );
}
