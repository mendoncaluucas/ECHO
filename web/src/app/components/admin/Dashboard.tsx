import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronRight, TriangleAlert } from 'lucide-react';
import {
  listarAreas,
  listarAuditoria,
  listarQRCodes,
  listarUsuarios,
  tokenDaSessao,
  usuarioLogado,
  type RegistroDeAuditoria,
} from '../../services/api';
import { descrever } from '../../descricaoDaAuditoria';
import { haQuanto, primeiroNome, saudacao } from '../../rotulos';
import {
  AvisoDeErro,
  CabecalhoDaPagina,
  Cartao,
  Esqueleto,
  Indicador,
  LinkDoCartao,
  Pagina,
} from '../layout/Pagina';

// Quantos registros do log entram na atividade recente.
const ATIVIDADES = 6;

type Pendencia = { chave: string; texto: string; acao: string; para: string };

type Resumo = {
  coordenadores: number;
  gerentes: number;
  qrCodesAtivos: number;
  areasAtivas: number;
  pendencias: Pendencia[];
};

export function AdminDashboard() {
  const token = tokenDaSessao() ?? '';
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atividades, setAtividades] = useState<RegistroDeAuditoria[] | null>(null);
  const [erroNasAtividades, setErroNasAtividades] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  // Sessão vencida (401) é tratada no serviço da API, que leva ao login.
  useEffect(() => {
    let ativo = true;
    setErro(null);

    Promise.all([listarUsuarios(token), listarQRCodes(token), listarAreas()])
      .then(([usuarios, qrCodes, areas]) => {
        if (!ativo) return;
        const ativos = usuarios.itens.filter((u) => u.ativo);
        const areasAtivas = areas.itens.filter((a) => a.ativo);
        const qrAtivos = qrCodes.itens.filter((q) => q.ativo);
        const coordenadores = ativos.filter((u) => u.papel === 'COORDENADOR').length;

        setResumo({
          coordenadores,
          gerentes: ativos.filter((u) => u.papel === 'GERENTE').length,
          qrCodesAtivos: qrAtivos.length,
          areasAtivas: areasAtivas.length,
          pendencias: pendenciasDe(areasAtivas, qrAtivos, coordenadores),
        });
      })
      .catch((e: Error & { status?: number }) => {
        if (!ativo) return;
        setErro(
          e.status === 403
            ? 'A visão geral é só para administradores.'
            : e.message || 'Não foi possível carregar a visão geral.'
        );
      });

    return () => {
      ativo = false;
    };
  }, [token, tentativa]);

  useEffect(() => {
    let ativo = true;
    setErroNasAtividades(false);

    // Os logins são a maioria do log e não contam o que mudou: ficam de fora daqui
    // (seguem no log completo). Pede uma folga para sobrar o bastante depois do filtro.
    listarAuditoria(token, { porPagina: 30 })
      .then((pagina) => {
        if (!ativo) return;
        setAtividades(pagina.itens.filter((r) => r.acao !== 'LOGIN').slice(0, ATIVIDADES));
      })
      .catch(() => {
        if (ativo) setErroNasAtividades(true);
      });

    return () => {
      ativo = false;
    };
  }, [token, tentativa]);

  return (
    <Pagina>
      <CabecalhoDaPagina
        sobretitulo="Administração"
        titulo={`${saudacao()}, ${primeiroNome(usuarioLogado()?.nome)}`}
        descricao="Quem usa o Echo, onde ele está nas mesas e o que mudou por último."
      />

      {erro ? (
        <AvisoDeErro mensagem={erro} aoTentarDeNovo={() => setTentativa((t) => t + 1)} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {resumo ? (
              <>
                <Indicador rotulo="Coordenadores ativos" valor={resumo.coordenadores} para="/admin/usuarios">
                  <Abrir>Usuários</Abrir>
                </Indicador>
                <Indicador rotulo="Gerentes ativos" valor={resumo.gerentes} para="/admin/usuarios">
                  <Abrir>Usuários</Abrir>
                </Indicador>
                <Indicador rotulo="QR Codes valendo" valor={resumo.qrCodesAtivos} para="/qr-generator">
                  <Abrir>QR Codes</Abrir>
                </Indicador>
                <Indicador rotulo="Áreas ativas" valor={resumo.areasAtivas} para="/admin/configuracoes">
                  <Abrir>Configurações</Abrir>
                </Indicador>
              </>
            ) : (
              [0, 1, 2, 3].map((i) => <Esqueleto key={i} className="h-[124px] rounded-2xl" />)
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Cartao
              titulo="Precisa de atenção"
              descricao="O que impede o cliente de avaliar ou a equipe de responder"
              className="lg:col-span-2"
            >
              {!resumo ? (
                <div className="flex flex-col gap-3">
                  <Esqueleto className="h-12" />
                  <Esqueleto className="h-12" />
                </div>
              ) : resumo.pendencias.length === 0 ? (
                <p className="flex items-start gap-2 text-sm font-semibold text-sucesso">
                  <CheckCircle2 className="mt-0.5 size-4 flex-none" aria-hidden="true" />
                  Tudo em ordem: cada área ativa tem um QR Code valendo e há quem trate as
                  ocorrências.
                </p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {resumo.pendencias.map((p) => (
                    // O link vai embaixo do texto: ao lado, no cartão estreito, espremia
                    // a frase numa coluna de uma palavra por linha.
                    <li key={p.chave} className="flex gap-2.5 rounded-xl bg-[#fdf6ea] px-3.5 py-3 text-sm">
                      <TriangleAlert className="mt-0.5 size-4 flex-none text-atencao" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="font-semibold break-words text-[#5c3a07]">{p.texto}</p>
                        <Link
                          to={p.para}
                          className="mt-1 inline-flex items-center gap-0.5 rounded-md font-bold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {p.acao}
                          <ChevronRight className="size-3.5" aria-hidden="true" />
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>

            <Cartao
              titulo="Atividade recente"
              descricao="O que mudou por último, sem os logins"
              acao={<LinkDoCartao para="/audit-log">Log completo</LinkDoCartao>}
              className="lg:col-span-3"
            >
              <AtividadeRecente registros={atividades} erro={erroNasAtividades} />
            </Cartao>
          </div>
        </div>
      )}
    </Pagina>
  );
}

function Abrir({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-primary">
      {children}
      <ChevronRight className="size-3.5" aria-hidden="true" />
    </span>
  );
}

// O que deixa o sistema sem funcionar de verdade, mesmo com tudo "cadastrado".
function pendenciasDe(
  areasAtivas: { id: string; nome: string }[],
  qrAtivos: { area: { id: string } }[],
  coordenadores: number
): Pendencia[] {
  const pendencias: Pendencia[] = [];

  if (areasAtivas.length === 0) {
    pendencias.push({
      chave: 'sem-areas',
      texto: 'Nenhuma área cadastrada: sem área, não há QR Code para as mesas.',
      acao: 'Cadastrar áreas',
      para: '/admin/configuracoes',
    });
  }

  for (const area of areasAtivas) {
    const codigos = qrAtivos.filter((q) => q.area.id === area.id).length;
    if (codigos === 0) {
      pendencias.push({
        chave: `sem-qr-${area.id}`,
        texto: `${area.nome} não tem QR Code valendo.`,
        acao: 'Gerar código',
        para: '/qr-generator',
      });
    } else if (codigos > 1) {
      pendencias.push({
        chave: `varios-qr-${area.id}`,
        texto: `${area.nome} tem ${codigos} QR Codes valendo ao mesmo tempo.`,
        acao: 'Substituir',
        para: '/qr-generator',
      });
    }
  }

  if (coordenadores === 0) {
    pendencias.push({
      chave: 'sem-coordenador',
      texto: 'Nenhum coordenador ativo para tratar as ocorrências.',
      acao: 'Cadastrar',
      para: '/admin/usuarios',
    });
  }

  return pendencias;
}

function AtividadeRecente({
  registros,
  erro,
}: {
  registros: RegistroDeAuditoria[] | null;
  erro: boolean;
}) {
  if (erro) {
    return <p className="text-sm text-muted-foreground">Não foi possível carregar a atividade recente.</p>;
  }
  if (!registros) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Esqueleto key={i} className="h-11" />
        ))}
      </div>
    );
  }
  if (registros.length === 0) {
    return <p className="text-sm text-muted-foreground">Nada registrado ainda.</p>;
  }

  return (
    <ul className="-my-1 divide-y divide-[#efefea]">
      {registros.map((r) => (
        <li key={r.id} className="py-3">
          <p className="text-sm leading-snug font-semibold break-words">{descrever(r)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {r.usuario.nome} · <time dateTime={r.criadoEm}>{haQuanto(r.criadoEm)}</time>
          </p>
        </li>
      ))}
    </ul>
  );
}
