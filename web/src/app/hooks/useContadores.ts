import { useEffect, useState } from 'react';
import {
  contarNotificacoes,
  EVENTO_NOTIFICACOES,
  listarOcorrencias,
  tokenDaSessao,
} from '../services/api';

// Um minuto basta para quem está no salão: o feedback não some se o número demorar.
const INTERVALO = 60_000;

export interface Contadores {
  notificacoes: number;
  pendentes: number;
}

// Números do menu lateral: notificações não lidas e ocorrências pendentes.
//
// Reconta ao abrir, a cada minuto com a aba visível (aba esquecida aberta não fica
// batendo na API a noite inteira), ao voltar para a aba, quando alguém marca
// notificação como lida, e a cada troca de tela (`chave`): tratar uma ocorrência e
// voltar ao painel não pode deixar o número velho.
//
// Erro é silencioso de propósito: o contador é acessório. Sessão vencida é tratada no
// serviço da API, que leva ao login; aqui o número só não aparece.
export function useContadores(chave: string): Contadores {
  const [contadores, setContadores] = useState<Contadores>({ notificacoes: 0, pendentes: 0 });

  useEffect(() => {
    let ativo = true;

    const contar = () => {
      const token = tokenDaSessao();
      if (!token || document.visibilityState !== 'visible') return;

      Promise.allSettled([
        contarNotificacoes(token),
        listarOcorrencias(token, { status: 'PENDENTE', porPagina: 1 }),
      ]).then(([notificacoes, pendentes]) => {
        if (!ativo) return;
        setContadores((atual) => ({
          notificacoes:
            notificacoes.status === 'fulfilled' ? notificacoes.value.naoLidas : atual.notificacoes,
          pendentes: pendentes.status === 'fulfilled' ? pendentes.value.total : atual.pendentes,
        }));
      });
    };

    contar();
    const intervalo = window.setInterval(contar, INTERVALO);
    document.addEventListener('visibilitychange', contar);
    window.addEventListener(EVENTO_NOTIFICACOES, contar);

    return () => {
      ativo = false;
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', contar);
      window.removeEventListener(EVENTO_NOTIFICACOES, contar);
    };
  }, [chave]);

  return contadores;
}
