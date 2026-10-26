import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Loader2, Pencil, Plus } from 'lucide-react';
import {
  atualizarRespostaPronta,
  criarRespostaPronta,
  listarRespostasProntas,
  type RespostaPronta,
} from '../../services/api';
import { avisarRapido } from '../../avisoRapido';
import { Cartao, Esqueleto } from '../layout/Pagina';

// Respostas prontas (pedido do Sinuelo): modelos que a equipe escolhe ao responder o
// cliente, no detalhe da ocorrência, e ajusta antes de enviar. Só o administrador
// cadastra. Desativar tira o modelo da lista de quem responde; não há apagar, como nas
// áreas, porque o log aponta para ele.

// Os mesmos limites da API.
const MAX_TITULO = 80;
const MAX_TEXTO = 1500;

const campo =
  'w-full min-w-0 rounded-xl border border-borda-campo bg-input-background px-3.5 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const botaoPrimario =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground transition-colors hover:bg-[#0a5242] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const botaoSecundario =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 font-semibold transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function mensagemDeFalha(e: unknown) {
  const status = (e as { status?: number }).status;
  if (status === 409) return 'Já existe uma resposta pronta com esse título.';
  if (status === 403) return 'Só administradores podem alterar as respostas prontas.';
  return e instanceof Error && e.message ? e.message : 'Algo deu errado. Tente novamente.';
}

function FormularioDoModelo({
  inicial,
  rotuloDoBotao,
  ocupado,
  aoSalvar,
  aoCancelar,
}: {
  inicial: { titulo: string; texto: string };
  rotuloDoBotao: string;
  ocupado: boolean;
  aoSalvar: (dados: { titulo: string; texto: string }) => void;
  aoCancelar: () => void;
}) {
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [texto, setTexto] = useState(inicial.texto);
  const idTitulo = useId();
  const idTexto = useId();
  const idAjuda = useId();
  const completo = titulo.trim().length > 0 && texto.trim().length > 0;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (completo && !ocupado) aoSalvar({ titulo: titulo.trim(), texto: texto.trim() });
  };

  return (
    <form onSubmit={enviar} onKeyDown={(e) => e.key === 'Escape' && aoCancelar()} className="flex flex-col gap-3">
      <div>
        <label htmlFor={idTitulo} className="text-sm font-bold">
          Título
        </label>
        <input
          id={idTitulo}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          maxLength={MAX_TITULO}
          placeholder="Ex.: Pedido de desculpas"
          autoFocus
          className={`${campo} mt-1.5 h-11`}
        />
      </div>
      <div>
        <label htmlFor={idTexto} className="text-sm font-bold">
          Texto
        </label>
        <textarea
          id={idTexto}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={MAX_TEXTO}
          rows={5}
          aria-describedby={idAjuda}
          className={`${campo} mt-1.5 resize-y py-3 leading-relaxed`}
        />
        <p id={idAjuda} className="mt-1.5 text-sm text-muted-foreground">
          Entra depois do "Olá, nome!", e quem responde pode ajustar antes de enviar.{' '}
          <span className="tabular-nums">
            {texto.length} de {MAX_TEXTO}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={!completo || ocupado} className={botaoPrimario}>
          {ocupado && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {rotuloDoBotao}
        </button>
        <button type="button" onClick={aoCancelar} className={botaoSecundario}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function SecaoRespostasProntas({ token }: { token: string }) {
  const [modelos, setModelos] = useState<RespostaPronta[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // 'novo' para o formulário de cadastro, o id para editar um, null para nenhum.
  const [editando, setEditando] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const buscaAtual = useRef(0);

  // Sessão vencida (401) é tratada no serviço da API, que leva ao login.
  const carregar = () => {
    const minhaVez = ++buscaAtual.current;
    listarRespostasProntas(token)
      .then((res) => {
        if (minhaVez === buscaAtual.current) setModelos(res.itens);
      })
      .catch((e) => {
        if (minhaVez === buscaAtual.current) setErro(mensagemDeFalha(e));
      });
  };

  useEffect(() => {
    carregar();
    return () => {
      buscaAtual.current++;
    };
  }, [token]);

  const salvar = async (id: string | null, dados: { titulo: string; texto: string }) => {
    setErro(null);
    setOcupadoId(id ?? 'novo');
    try {
      if (id) await atualizarRespostaPronta(id, dados, token);
      else await criarRespostaPronta(dados, token);
      setEditando(null);
      avisarRapido(id ? `Resposta pronta "${dados.titulo}" salva` : `Resposta pronta "${dados.titulo}" criada`);
      carregar();
    } catch (falha) {
      setErro(mensagemDeFalha(falha));
    } finally {
      setOcupadoId(null);
    }
  };

  const alternar = async (modelo: RespostaPronta) => {
    setErro(null);
    setOcupadoId(modelo.id);
    try {
      await atualizarRespostaPronta(modelo.id, { ativo: !modelo.ativo }, token);
      avisarRapido(modelo.ativo ? `"${modelo.titulo}" desativada` : `"${modelo.titulo}" reativada`);
      carregar();
    } catch (falha) {
      setErro(mensagemDeFalha(falha));
    } finally {
      setOcupadoId(null);
    }
  };

  return (
    <Cartao
      titulo="Respostas prontas"
      descricao="Modelos que a equipe escolhe ao responder um cliente e ajusta antes de enviar. Desativada, a resposta sai da lista de quem responde."
      acao={
        modelos &&
        editando !== 'novo' && (
          <button
            type="button"
            onClick={() => {
              setEditando('novo');
              setErro(null);
            }}
            className={botaoSecundario}
          >
            <Plus className="size-4" aria-hidden="true" />
            Nova resposta pronta
          </button>
        )
      }
    >
      {erro && (
        <p role="alert" className="mb-4 rounded-xl bg-perigo-fundo px-3.5 py-3 text-sm font-semibold text-perigo">
          {erro}
        </p>
      )}

      {editando === 'novo' && (
        <div className="mb-4 rounded-xl border border-border p-4">
          <FormularioDoModelo
            inicial={{ titulo: '', texto: '' }}
            rotuloDoBotao="Criar"
            ocupado={ocupadoId === 'novo'}
            aoSalvar={(dados) => salvar(null, dados)}
            aoCancelar={() => setEditando(null)}
          />
        </div>
      )}

      {!modelos ? (
        !erro && (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando respostas prontas">
            {[0, 1].map((i) => (
              <Esqueleto key={i} className="h-16" />
            ))}
          </div>
        )
      ) : modelos.length === 0 ? (
        editando !== 'novo' && (
          <p className="text-sm text-muted-foreground">
            Nenhuma resposta pronta ainda. Crie as mais comuns, como um pedido de desculpas ou um agradecimento.
          </p>
        )
      ) : (
        <ul className="-my-1 divide-y divide-[#efefea]">
          {modelos.map((modelo) => {
            const ocupado = ocupadoId === modelo.id;
            return (
              <li key={modelo.id} className="py-3">
                {editando === modelo.id ? (
                  <FormularioDoModelo
                    inicial={modelo}
                    rotuloDoBotao="Salvar"
                    ocupado={ocupado}
                    aoSalvar={(dados) => salvar(modelo.id, dados)}
                    aoCancelar={() => setEditando(null)}
                  />
                ) : (
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={`font-semibold break-words ${modelo.ativo ? '' : 'text-muted-foreground'}`}>
                        {modelo.titulo}
                        {!modelo.ativo && (
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                            Desativada
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-sm break-words whitespace-pre-line text-muted-foreground">
                        {modelo.texto}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditando(modelo.id);
                        setErro(null);
                      }}
                      aria-label={`Editar ${modelo.titulo}`}
                      title="Editar"
                      className="flex size-9 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => alternar(modelo)}
                      disabled={ocupado}
                      aria-label={`${modelo.ativo ? 'Desativar' : 'Reativar'} ${modelo.titulo}`}
                      className={`h-9 flex-none rounded-lg px-2.5 text-sm font-bold transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                        modelo.ativo ? 'text-perigo hover:bg-perigo-fundo' : 'text-primary hover:bg-accent'
                      }`}
                    >
                      {ocupado ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : modelo.ativo ? 'Desativar' : 'Reativar'}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Cartao>
  );
}
