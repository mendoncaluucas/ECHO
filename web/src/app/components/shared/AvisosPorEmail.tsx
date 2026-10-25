import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buscarPreferenciasDeAviso,
  salvarPreferenciaDeAviso,
  type AvisoPorEmail,
  type PreferenciasDeAviso,
} from '../../services/api';
import { avisarRapido } from '../../avisoRapido';
import { AvisoDeErro, Cartao, Esqueleto, Segmentado } from '../layout/Pagina';

// Escolha de cada pessoa: quais feedbacks novos chegam também por e-mail, além do sino.
// Salva ao tocar, sem botão de salvar, como as abas: é uma escolha só.

const OPCOES: { valor: AvisoPorEmail; rotulo: string; explicacao: string; aviso: string }[] = [
  {
    valor: 'NENHUM',
    rotulo: 'Nenhum',
    explicacao: 'Você não recebe e-mail. Os feedbacks novos chegam só no sino.',
    aviso: 'Avisos por e-mail desligados',
  },
  {
    valor: 'RECLAMACOES',
    rotulo: 'Reclamações',
    explicacao: 'Você recebe um e-mail a cada reclamação nova. Elogios e sugestões chegam só no sino.',
    aviso: 'Avisos por e-mail: só reclamações',
  },
  {
    valor: 'TODOS',
    rotulo: 'Todos',
    explicacao: 'Você recebe um e-mail a cada feedback novo: elogio, sugestão ou reclamação.',
    aviso: 'Avisos por e-mail: todos os feedbacks',
  },
];

export function AvisosPorEmail({ token }: { token: string }) {
  const [preferencias, setPreferencias] = useState<PreferenciasDeAviso | null>(null);
  const [erroAoCarregar, setErroAoCarregar] = useState<string | null>(null);
  const [erroAoSalvar, setErroAoSalvar] = useState<string | null>(null);
  // Cliques seguidos: só a resposta do último vale, e uma falha volta ao último valor
  // que o servidor confirmou (não ao anterior na tela, que pode nunca ter sido salvo).
  const ultimoPedido = useRef(0);
  const confirmado = useRef<AvisoPorEmail | null>(null);

  const carregar = useCallback(() => {
    setErroAoCarregar(null);
    buscarPreferenciasDeAviso(token)
      .then((p) => {
        confirmado.current = p.avisoPorEmail;
        setPreferencias(p);
      })
      .catch((e: Error) => setErroAoCarregar(e.message || 'Não foi possível carregar os avisos por e-mail.'));
  }, [token]);

  useEffect(carregar, [carregar]);

  const escolher = async (valor: AvisoPorEmail) => {
    if (!preferencias || valor === preferencias.avisoPorEmail) return;
    const meuPedido = ++ultimoPedido.current;
    setErroAoSalvar(null);
    setPreferencias({ ...preferencias, avisoPorEmail: valor });
    try {
      const salvas = await salvarPreferenciaDeAviso(valor, token);
      confirmado.current = salvas.avisoPorEmail;
      if (meuPedido !== ultimoPedido.current) return;
      setPreferencias(salvas);
      avisarRapido(OPCOES.find((o) => o.valor === salvas.avisoPorEmail)!.aviso);
    } catch (e) {
      if (meuPedido !== ultimoPedido.current) return;
      setPreferencias((atual) => (atual && confirmado.current ? { ...atual, avisoPorEmail: confirmado.current } : atual));
      setErroAoSalvar(e instanceof Error && e.message ? e.message : 'Não foi possível salvar. Tente de novo.');
    }
  };

  if (erroAoCarregar) {
    return <AvisoDeErro mensagem={erroAoCarregar} aoTentarDeNovo={carregar} />;
  }

  if (!preferencias) {
    return (
      <Cartao titulo="Avisos por e-mail">
        <Esqueleto className="h-11" />
      </Cartao>
    );
  }

  if (!preferencias.envioLigado) {
    return (
      <Cartao
        titulo="Avisos por e-mail"
        descricao="O envio de e-mail não está ligado neste servidor. Os feedbacks novos chegam no sino."
      >
        <p className="text-sm text-muted-foreground">Quem administra o Echo liga o envio na configuração da API.</p>
      </Cartao>
    );
  }

  const escolhida = OPCOES.find((o) => o.valor === preferencias.avisoPorEmail) ?? OPCOES[1];

  return (
    <Cartao titulo="Avisos por e-mail" descricao={`Além do sino, para ${preferencias.email}.`}>
      {erroAoSalvar && (
        <p role="alert" className="mb-3 rounded-xl bg-perigo-fundo px-3.5 py-3 text-sm font-semibold text-perigo">
          {erroAoSalvar}
        </p>
      )}
      <Segmentado
        rotulo="Receber por e-mail"
        opcoes={OPCOES.map(({ valor, rotulo }) => ({ valor, rotulo }))}
        valor={escolhida.valor}
        aoMudar={escolher}
      />
      <p className="mt-3 text-sm text-[#3a3f4a]">{escolhida.explicacao}</p>
      {preferencias.modoDeTeste && (
        <p className="mt-2 text-sm text-muted-foreground">
          Em teste: os e-mails vão para um endereço de demonstração, não para o seu.
        </p>
      )}
    </Cartao>
  );
}
