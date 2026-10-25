// Envio de e-mail. O provedor fica atrás de uma interface para poder ser trocado sem
// mexer em quem envia: hoje o Resend (entrega acadêmica), na entrega ao Sinuelo o
// serviço de e-mail deles. Ver docs/DEPLOY.md
//
// Sem RESEND_API_KEY o envio fica desligado: nada sai, e o resto do sistema funciona
// igual (o sino continua avisando).
//
// O Resend fala por HTTPS. Isso importa: o plano gratuito do Render bloqueia a saída
// SMTP (portas 25, 465 e 587), então um provedor por SMTP só funciona no plano pago.

export interface Email {
  para: string;
  assunto: string;
  texto: string;
  html: string;
  // Para onde vai a resposta de quem recebe. Sem isto, iria para o remetente, que no
  // Resend sem domínio é o onboarding@resend.dev, e se perderia.
  responderPara?: string;
}

export interface ProvedorDeEmail {
  nome: string;
  enviar(emails: Email[]): Promise<void>;
}

// Sem domínio próprio verificado, o Resend só aceita este remetente, e ele só entrega
// para o e-mail de quem é dono da conta.
const REMETENTE_PADRAO = "Echo <onboarding@resend.dev>";

const URL_DO_RESEND = "https://api.resend.com/emails/batch";
// Limite do Resend por chamada em lote.
const MAXIMO_POR_LOTE = 100;
// Um provedor lento não pode segurar a API para sempre.
const TEMPO_LIMITE_MS = 10_000;

export function provedorResend(
  chave: string,
  remetente: string,
  buscar: typeof fetch = fetch
): ProvedorDeEmail {
  return {
    nome: "Resend",
    async enviar(emails) {
      for (let i = 0; i < emails.length; i += MAXIMO_POR_LOTE) {
        const lote = emails.slice(i, i + MAXIMO_POR_LOTE);
        const res = await buscar(URL_DO_RESEND, {
          method: "POST",
          headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
          body: JSON.stringify(
            lote.map((e) => ({
              from: remetente,
              to: [e.para],
              subject: e.assunto,
              text: e.texto,
              html: e.html,
              ...(e.responderPara && { reply_to: [e.responderPara] }),
            }))
          ),
          signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
        });
        if (!res.ok) {
          // Só o status e a mensagem do provedor: o erro vai para o log do servidor, e
          // destinatário e conteúdo não têm o que fazer lá.
          const corpo = (await res.json().catch(() => null)) as { message?: unknown } | null;
          const mensagem = typeof corpo?.message === "string" ? `: ${corpo.message}` : "";
          throw new Error(`Resend respondeu ${res.status}${mensagem}`);
        }
      }
    },
  };
}

function provedorDoAmbiente(): ProvedorDeEmail | null {
  const chave = process.env.RESEND_API_KEY?.trim();
  if (!chave) return null;
  return provedorResend(chave, process.env.EMAIL_REMETENTE?.trim() || REMETENTE_PADRAO);
}

// undefined: ainda não leu o ambiente. Lido na primeira vez, e não ao importar, porque
// o app.ts carrega o .env depois dos imports.
let provedor: ProvedorDeEmail | null | undefined;

function provedorAtual() {
  if (provedor === undefined) provedor = provedorDoAmbiente();
  return provedor;
}

// Para os testes, que trocam o provedor por um falso. null desliga o envio.
export function usarProvedorDeEmail(novo: ProvedorDeEmail | null) {
  provedor = novo;
}

export function emailLigado() {
  return provedorAtual() !== null;
}

// Endereço de teste: com ele, todo e-mail vai para lá, dizendo para quem iria. Serve
// para a demonstração (o Resend sem domínio só entrega ao dono da conta) e impede que
// os e-mails fictícios do seed (gerente@sinuelo.com) recebam alguma coisa.
function destinoDeTeste() {
  return process.env.EMAIL_DESTINO_TESTE?.trim() || null;
}

export function emModoDeTeste() {
  return destinoDeTeste() !== null;
}

// Para as telas: se dá para enviar, e se o envio vai para o endereço de teste.
export function estadoDoEnvio(): "desligado" | "teste" | "ligado" {
  if (!emailLigado()) return "desligado";
  return emModoDeTeste() ? "teste" : "ligado";
}

export const escaparHtml = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// O "responder para" também sai: em teste, ele seria um e-mail fictício do seed, e
// responder ao teste mandaria algo para fora. O aviso diz para onde iria.
function desviarParaTeste(email: Email, destino: string): Email {
  const aviso =
    `Teste do Echo: em produção, este e-mail iria para ${email.para}.` +
    (email.responderPara ? ` Quem respondesse falaria com ${email.responderPara}.` : "");
  return {
    para: destino,
    assunto: `[Teste · para ${email.para}] ${email.assunto}`,
    texto: `${aviso}\n\n${email.texto}`,
    html:
      `<p style="margin:0 0 16px;padding:8px 12px;background:#fdf3d8;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1d2129">` +
      `${escaparHtml(aviso)}</p>${email.html}`,
  };
}

// Envia e devolve quantos saíram. Desligado, não envia nada e devolve 0. Falha do
// provedor sobe como erro: quem chama decide se isso para alguma coisa.
export async function enviarEmails(emails: Email[]): Promise<number> {
  const atual = provedorAtual();
  if (!atual || emails.length === 0) return 0;
  const destino = destinoDeTeste();
  await atual.enviar(destino ? emails.map((e) => desviarParaTeste(e, destino)) : emails);
  return emails.length;
}

// Uma linha para o log ao ligar a API: o que está configurado, sem a chave.
export function resumoDoEmail() {
  const atual = provedorAtual();
  if (!atual) return "E-mail desligado (sem RESEND_API_KEY).";
  const remetente = process.env.EMAIL_REMETENTE?.trim() || REMETENTE_PADRAO;
  const destino = destinoDeTeste();
  if (destino) return `E-mail pelo ${atual.nome}, em teste: tudo vai para o endereço de EMAIL_DESTINO_TESTE.`;
  if (remetente === REMETENTE_PADRAO) {
    return (
      `E-mail pelo ${atual.nome} com o remetente de teste e sem EMAIL_DESTINO_TESTE: ` +
      "sem domínio verificado, o Resend recusa todo destinatário que não seja o dono da conta."
    );
  }
  return `E-mail pelo ${atual.nome}, de ${remetente}.`;
}

