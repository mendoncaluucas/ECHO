import type { AvisoPorEmail, TipoFeedback } from "@prisma/client";
import { prisma } from "./prisma.js";
import { emailLigado, enviarEmails, escaparHtml, type Email } from "./email.js";

// Aviso por e-mail à equipe quando chega um feedback novo, além do sino. Cada pessoa
// escolhe o que recebe (User.avisoPorEmail): nada, só reclamações ou tudo.
//
// O e-mail diz o tipo, a mesa, a hora e as notas, e leva à ocorrência no Echo. Não leva
// o comentário nem o contato do cliente (LGPD): na caixa de e-mail de alguém, a
// retenção do Echo não alcança, e o dado ficaria para sempre fora do controle dele.

const QUEM_RECEBE: Record<TipoFeedback, AvisoPorEmail[]> = {
  RECLAMACAO: ["RECLAMACOES", "TODOS"],
  SUGESTAO: ["TODOS"],
  ELOGIO: ["TODOS"],
};

const NOME_DO_TIPO: Record<TipoFeedback, { nome: string; um: string; novo: string }> = {
  RECLAMACAO: { nome: "Reclamação", um: "uma reclamação", novo: "nova" },
  SUGESTAO: { nome: "Sugestão", um: "uma sugestão", novo: "nova" },
  ELOGIO: { nome: "Elogio", um: "um elogio", novo: "novo" },
};

// O mesmo endereço para onde o QR aponta (ver qrcodes.routes.ts), sem barra no fim.
const enderecoDoEcho = () => (process.env.WEB_BASE_URL ?? "http://localhost:5173").replace(/\/+$/, "");

const FUSO = "America/Sao_Paulo";
const data = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: FUSO });
const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO });

interface FeedbackDoAviso {
  id: string;
  tipo: TipoFeedback;
  criadoEm: Date;
  area: { nome: string } | null;
  avaliacoes: { estrelas: number; category: { nome: string } }[];
}

export function montarAviso(feedback: FeedbackDoAviso): Omit<Email, "para"> {
  const tipo = NOME_DO_TIPO[feedback.tipo];
  // Nome de área vem do administrador; sem quebra de linha, para não bagunçar o assunto.
  const area = feedback.area?.nome.replace(/\s+/g, " ").trim() || "uma área sem nome";
  const quando = `${data.format(feedback.criadoEm)} às ${hora.format(feedback.criadoEm)}`;
  const notas = feedback.avaliacoes.map((a) => `${a.category.nome} ${a.estrelas} de 5`);
  const link = `${enderecoDoEcho()}/coordenador/ocorrencia/${feedback.id}`;
  const preferencias = `${enderecoDoEcho()}/notificacoes`;

  const assunto = `${tipo.nome} ${tipo.novo} · ${area}`;
  const abertura = `Chegou ${tipo.um}: ${area}, ${quando}.`;
  const privacidade = "O comentário e o contato do cliente ficam só no Echo.";
  const rodape = "Você recebe este aviso pela sua escolha nas Notificações do Echo. Para mudar:";

  const texto = [
    abertura,
    notas.length > 0 ? `Notas: ${notas.join(", ")}.` : null,
    `Para ler e tratar, abra no Echo:\n${link}`,
    privacidade,
    `${rodape}\n${preferencias}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1d2129;max-width:520px">
<p style="margin:0 0 12px">${escaparHtml(abertura)}</p>
${
  notas.length > 0
    ? `<ul style="margin:0 0 16px;padding-left:20px">${notas.map((n) => `<li>${escaparHtml(n)}</li>`).join("")}</ul>`
    : ""
}<p style="margin:0 0 20px"><a href="${escaparHtml(link)}" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#0f6e5a;color:#ffffff;font-weight:bold;text-decoration:none">Abrir no Echo</a></p>
<p style="margin:0 0 12px;color:#5b616e;font-size:13px">${escaparHtml(privacidade)}</p>
<p style="margin:0;color:#5b616e;font-size:13px">${escaparHtml(rodape)} <a href="${escaparHtml(preferencias)}" style="color:#0f6e5a">${escaparHtml(preferencias)}</a></p>
</div>`;

  return { assunto, texto, html };
}

// Monta e envia o aviso de um feedback para quem quer recebê-lo. Devolve quantos
// e-mails saíram (0 com o envio desligado ou sem ninguém que queira).
export async function avisarEquipePorEmail(feedbackId: string): Promise<number> {
  if (!emailLigado()) return 0;

  const feedback = await prisma.feedback.findUnique({
    where: { id: feedbackId },
    select: {
      id: true,
      tipo: true,
      criadoEm: true,
      area: { select: { nome: true } },
      avaliacoes: {
        orderBy: { category: { nome: "asc" } },
        select: { estrelas: true, category: { select: { nome: true } } },
      },
    },
  });
  if (!feedback) return 0;

  // Mesma regra do sino: só a gestão ativa.
  const equipe = await prisma.user.findMany({
    where: { ativo: true, avisoPorEmail: { in: QUEM_RECEBE[feedback.tipo] } },
    orderBy: { email: "asc" },
    select: { email: true },
  });
  if (equipe.length === 0) return 0;

  const aviso = montarAviso(feedback);
  return enviarEmails(equipe.map((pessoa) => ({ para: pessoa.email, ...aviso })));
}

// Avisos em andamento. O POST do feedback não espera o e-mail (o cliente não tem por
// que esperar o provedor responder); os testes esperam por aqui.
const pendentes = new Set<Promise<void>>();

// Dispara o aviso sem segurar quem chama. Falha no envio fica no log do servidor e não
// desfaz nada: o feedback já foi gravado e o sino já avisou.
export function dispararAvisoPorEmail(feedbackId: string) {
  const envio = avisarEquipePorEmail(feedbackId)
    .then(() => undefined)
    .catch((erro: unknown) => {
      console.error("Aviso por e-mail não enviado:", erro instanceof Error ? erro.message : erro);
    })
    .finally(() => pendentes.delete(envio));
  pendentes.add(envio);
}

export async function esperarAvisosPendentes() {
  await Promise.all([...pendentes]);
}
