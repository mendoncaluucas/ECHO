import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { buscarPrazosDePrivacidade, type PrazosDePrivacidade } from '../../services/api';
import { rotuloDePrazo } from '../../rotulos';
import { Marca } from '../layout/Marca';

// Página de privacidade (LGPD): o que o Echo guarda do cliente, para quê, por quanto
// tempo e como pedir para apagar. Aberta pelo link do formulário e do login, sem
// QR Code. Os prazos vêm da API, para o texto não ficar errado quando o administrador
// mudar.
//
// O texto é provisório até o Sinuelo validar (de preferência com quem cuida da parte
// jurídica deles) e informar um e-mail de contato. Ver docs/PROXIMOS-PASSOS.md.

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg leading-snug font-extrabold tracking-tight">{titulo}</h2>
      <div className="flex flex-col gap-2 leading-relaxed text-[#3a3f4a]">{children}</div>
    </section>
  );
}

export function Privacidade() {
  const location = useLocation();
  const navigate = useNavigate();
  // De onde veio, para voltar ao mesmo ponto (a avaliação guarda o rascunho).
  const de = (location.state as { de?: string } | null)?.de;
  const [prazos, setPrazos] = useState<PrazosDePrivacidade | null>(null);
  const [semPrazos, setSemPrazos] = useState(false);

  // Abre no topo. O roteador não volta a rolagem ao trocar de página: vindo do rodapé do
  // formulário, a página abria já rolada, com o título fora da tela (visto no teste).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    let ativo = true;
    buscarPrazosDePrivacidade()
      .then((p) => ativo && setPrazos(p))
      .catch(() => ativo && setSemPrazos(true));
    return () => {
      ativo = false;
    };
  }, []);

  const rotuloDoVoltar = de?.startsWith('/feedback') ? 'Voltar para a avaliação' : de === '/' ? 'Voltar' : null;
  // Volta no histórico, como o "voltar" do celular, e não abre a página de novo: um
  // link empilharia outra cópia da avaliação, e a seta de voltar dela (que também anda
  // no histórico) cairia aqui de novo em vez de na etapa anterior. A chave "default" é a
  // da primeira página do app nesta aba: aí não há para onde voltar no histórico, e vai
  // direto ao endereço de origem.
  const voltar = () => {
    if (location.key !== 'default') navigate(-1);
    else if (de) navigate(de, { replace: true });
  };

  return (
    <main className="flex min-h-full justify-center bg-background">
      <div className="flex w-full max-w-xl flex-col gap-7 px-6 pt-7 pb-12">
        <div className="flex items-center justify-between gap-3">
          <Marca legenda="Restaurante Sinuelo" />
          {rotuloDoVoltar && (
            <button
              type="button"
              onClick={voltar}
              className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-primary hover:bg-accent"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {rotuloDoVoltar}
            </button>
          )}
        </div>

        <div>
          <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">Como cuidamos dos seus dados</h1>
          <p className="mt-2 text-muted-foreground">
            O Restaurante Sinuelo usa o Echo para receber a avaliação de quem passa pelas mesas.
          </p>
        </div>

        <Secao titulo="O que guardamos">
          <p>
            As notas que você dá, o tipo da avaliação (elogio, sugestão ou reclamação), o comentário, se você escrever,
            a mesa e a data. <strong>Sem identificação:</strong> por padrão, ninguém sabe quem avaliou.
          </p>
          <p>
            Seu nome e seu e-mail, <strong>só se você pedir resposta</strong>. O nome é opcional.
          </p>
        </Secao>

        <Secao titulo="Para quê">
          <p>
            Para a equipe melhorar o atendimento. O e-mail serve só para responder a sua avaliação: não é usado para
            propaganda nem vendido ou repassado a outras empresas.
          </p>
          <p>
            Quem vê é a equipe do restaurante que cuida das avaliações. O seu contato não aparece nas listas nem nos
            relatórios: só ao abrir a sua avaliação, para responder.
          </p>
          <p>
            Os dados ficam guardados em serviços de hospedagem na internet, contratados para o Echo funcionar.
          </p>
        </Secao>

        <Secao titulo="Por quanto tempo">
          {prazos ? (
            <ul className="flex list-disc flex-col gap-1 pl-5">
              <li>
                Nome e e-mail: <strong>{rotuloDePrazo(prazos.contatoDias)}</strong> depois da avaliação.
              </li>
              <li>
                Comentário: <strong>{rotuloDePrazo(prazos.comentarioDias)}</strong> depois da avaliação.
              </li>
            </ul>
          ) : semPrazos ? (
            <p>Nome, e-mail e comentário ficam por um prazo limitado, definido pelo restaurante.</p>
          ) : (
            <span role="status" className="flex flex-col gap-2">
              <span className="sr-only">Carregando os prazos</span>
              <span aria-hidden="true" className="block h-5 w-3/4 animate-pulse rounded-lg bg-muted" />
              <span aria-hidden="true" className="block h-5 w-2/3 animate-pulse rounded-lg bg-muted" />
            </span>
          )}
          <p>
            Depois disso, são apagados sozinhos. As notas continuam, sem nada que identifique você, só para os números
            do restaurante.
          </p>
        </Secao>

        <Secao titulo="Para apagar seus dados antes">
          <p>
            É um direito seu (Lei Geral de Proteção de Dados). Peça a um atendente ou à gerência do restaurante, dizendo
            o e-mail que você usou. Quando o pedido chega a quem administra o Echo no restaurante, o nome, o e-mail e o
            comentário de todas as suas avaliações são apagados na hora.
          </p>
        </Secao>
      </div>
    </main>
  );
}
