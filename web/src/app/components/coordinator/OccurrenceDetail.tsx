import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Loader2, Mail, Save, Send, Star, UserCheck } from 'lucide-react';
import {
  atualizarStatusOcorrencia,
  buscarOcorrencia,
  encerrarSessao,
  tokenDaSessao,
  type Ocorrencia,
  type StatusOcorrencia,
} from '../../services/api';

const tipoLabel: Record<string, { texto: string; classe: string }> = {
  RECLAMACAO: { texto: 'Reclamação', classe: 'bg-red-100 text-red-700' },
  SUGESTAO: { texto: 'Sugestão', classe: 'bg-amber-100 text-amber-700' },
  ELOGIO: { texto: 'Elogio', classe: 'bg-green-100 text-green-700' },
};

const statusLabel: Record<StatusOcorrencia, string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  RESOLVIDO: 'Resolvido',
};

// Quem pediu resposta deixou nome e e-mail. Só o detalhe recebe o contato da API
// (nunca as listas), porque é daqui que alguém vai responder.
function ContatoDoCliente({
  contato,
  area,
  criadoEm,
}: {
  contato: { nome: string | null; email: string };
  area: string | null;
  criadoEm: string;
}) {
  const [copiado, setCopiado] = useState(false);

  const assunto = 'Sobre a sua avaliação no Restaurante Sinuelo';
  const corpo =
    `Olá${contato.nome ? `, ${contato.nome}` : ''}!\n\n` +
    `Recebemos a avaliação que você deixou em ${new Date(criadoEm).toLocaleDateString('pt-BR')}` +
    `${area ? ` (${area})` : ''}.\n\n`;
  // O endereço vai codificado (menos o @): um e-mail antigo com "?cc=..." viraria cópia
  // para outra pessoa na resposta. A API já recusa esses endereços; isto cobre o que
  // tiver sido gravado antes.
  const destinatario = contato.email.split('@').map(encodeURIComponent).join('@');
  const link = `mailto:${destinatario}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;

  // Para quem usa e-mail no navegador (Gmail, Outlook web): o mailto: costuma não
  // abrir nada nesses casos, e copiar resolve.
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(contato.email);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de área de transferência: o e-mail continua visível na tela.
    }
  };

  return (
    <div className="rounded-xl border border-[#cfe5dc] bg-accent p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-accent-foreground">
        <Mail className="size-4" aria-hidden="true" />
        O cliente pediu resposta
      </p>
      <p className="mt-2 text-gray-900">
        {contato.nome && <span className="font-semibold">{contato.nome} · </span>}
        <span className="break-all">{contato.email}</span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={link}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[#0a5242]"
        >
          <Send className="size-4" aria-hidden="true" />
          Responder por e-mail
        </a>
        <button
          type="button"
          onClick={copiar}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#cfe5dc] bg-card px-4 text-sm font-semibold text-accent-foreground transition-colors hover:bg-white"
        >
          {copiado ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          <span aria-live="polite">{copiado ? 'Copiado' : 'Copiar e-mail'}</span>
        </button>
      </div>
    </div>
  );
}

export function OccurrenceDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [ocorrencia, setOcorrencia] = useState<Ocorrencia | null>(null);
  const [status, setStatus] = useState<StatusOcorrencia>('PENDENTE');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const token = tokenDaSessao();

  // A ocorrência abre do painel, do registro, do log e das notificações. Mandar
  // sempre para o painel do coordenador deixava o gerente que veio do sino numa tela
  // que não é a dele. Volta de onde veio; link aberto direto, sem histórico, cai no painel.
  const voltarParaOrigem = () => {
    const temDeOndeVoltar = (window.history.state?.idx ?? 0) > 0;
    if (temDeOndeVoltar) navigate(-1);
    else navigate('/coordenador/ocorrencias');
  };

  useEffect(() => {
    if (!token || !id) {
      navigate('/coordenador/login');
      return;
    }

    let ativo = true;

    buscarOcorrencia(id, token)
      .then((res) => {
        if (!ativo) return;
        setOcorrencia(res);
        setStatus(res.status);
      })
      .catch((e: Error & { status?: number }) => {
        if (!ativo) return;
        if (e.status === 401) {
          encerrarSessao();
          navigate('/coordenador/login');
          return;
        }
        setErro(e.message || 'Não foi possível carregar a ocorrência.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [id, token, navigate]);

  const handleSalvar = async () => {
    if (!id || !token) return;
    setErro(null);
    setSalvando(true);
    try {
      await atualizarStatusOcorrencia(id, status, token);
      voltarParaOrigem();
    } catch (e) {
      const status401 = (e as { status?: number }).status === 401;
      if (status401) {
        encerrarSessao();
        navigate('/coordenador/login');
        return;
      }
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const voltar = (
    <button
      onClick={voltarParaOrigem}
      className="flex items-center gap-2 text-purple-600 hover:text-purple-700 mb-6 mt-4 font-semibold"
    >
      <ArrowLeft className="w-5 h-5" />
      Voltar
    </button>
  );

  if (carregando) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!ocorrencia) {
    return (
      <div className="p-4">
        <div className="max-w-3xl mx-auto">
          {voltar}
          <p className="bg-white rounded-2xl shadow-lg p-6 text-gray-700">
            {erro ?? 'Ocorrência não encontrada.'}
          </p>
        </div>
      </div>
    );
  }

  const tipo = tipoLabel[ocorrencia.tipo] ?? {
    texto: ocorrencia.tipo,
    classe: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="p-4 pb-8">
      <div className="max-w-3xl mx-auto">
        {voltar}

        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
          <div className="border-b border-gray-200 pb-4">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl font-bold text-gray-900">Ocorrência</h1>
              <span
                className={`px-3 py-1 rounded-full text-sm font-semibold ${tipo.classe}`}
              >
                {tipo.texto}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span>{ocorrencia.anonimo ? 'Anônimo' : 'Identificado'}</span>
              {ocorrencia.area && (
                <>
                  <span>•</span>
                  <span>{ocorrencia.area.nome}</span>
                </>
              )}
              <span>•</span>
              <span>{new Date(ocorrencia.criadoEm).toLocaleString('pt-BR')}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Avaliação por categoria
            </label>
            <div className="space-y-2">
              {ocorrencia.avaliacoes.map((avaliacao) => (
                <div key={avaliacao.categoria} className="flex items-center gap-3">
                  <span className="w-32 text-gray-700">{avaliacao.categoria}</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((estrela) => (
                      <Star
                        key={estrela}
                        className={`w-5 h-5 ${
                          estrela <= avaliacao.estrelas
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Comentário do Cliente
            </label>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-gray-700 leading-relaxed">
                {ocorrencia.comentario || 'Sem comentário.'}
              </p>
            </div>
          </div>

          {ocorrencia.contato && (
            <ContatoDoCliente
              contato={ocorrencia.contato}
              area={ocorrencia.area?.nome ?? null}
              criadoEm={ocorrencia.criadoEm}
            />
          )}

          {ocorrencia.tratadoPor && (
            <div className="bg-purple-50 rounded-xl p-4 flex items-center gap-2 text-sm text-purple-900">
              <UserCheck className="w-4 h-4 text-purple-600" />
              <span>
                Tratado por <strong>{ocorrencia.tratadoPor.nome}</strong>
                {ocorrencia.tratadoEm &&
                  ` em ${new Date(ocorrencia.tratadoEm).toLocaleString('pt-BR')}`}
              </span>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusOcorrencia)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {(Object.keys(statusLabel) as StatusOcorrencia[]).map((valor) => (
                <option key={valor} value={valor}>
                  {statusLabel[valor]}
                </option>
              ))}
            </select>
          </div>

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {erro}
            </p>
          )}

          <button
            onClick={handleSalvar}
            disabled={salvando || status === ocorrencia.status}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-4 px-6 rounded-xl font-semibold transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {salvando ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Salvar Alterações
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
