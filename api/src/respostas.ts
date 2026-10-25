import { escaparHtml, type Email } from "./email.js";

// Resposta da equipe ao cliente que pediu retorno. O texto é o que a pessoa escreveu
// na tela, como escreveu (a tela já começa com o "Olá, fulano"); o Echo só acrescenta a
// assinatura e um rodapé dizendo por que o cliente recebe isto.
//
// "Responder para" é o e-mail de quem escreveu: se o cliente responder, a conversa
// segue direto com essa pessoa, fora do Echo.

export const MAX_RESPOSTA = 2000;

const FUSO = "America/Sao_Paulo";
const data = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: FUSO });

// O mesmo endereço do QR e dos avisos, sem barra no fim.
const enderecoDoEcho = () => (process.env.WEB_BASE_URL ?? "http://localhost:5173").replace(/\/+$/, "");

export function montarResposta({
  texto,
  para,
  autor,
  restaurante,
  avaliadoEm,
}: {
  texto: string;
  para: string;
  autor: { nome: string; email: string };
  restaurante: string;
  avaliadoEm: Date;
}): Email {
  const assinatura = `${autor.nome}, da equipe do ${restaurante}`;
  const motivo =
    `Você recebe este e-mail porque pediu uma resposta ao avaliar o ${restaurante} em ` +
    `${data.format(avaliadoEm)}. Para continuar a conversa, é só responder.`;
  const privacidade = `${enderecoDoEcho()}/privacidade`;

  // Quebras de linha viram <br>, e só depois de escapar: o texto é livre.
  const paragrafos = texto
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${escaparHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

  return {
    para,
    responderPara: autor.email,
    assunto: `Resposta do ${restaurante} sobre a sua avaliação`,
    texto: [texto, `— ${assinatura}`, motivo, `Como cuidamos dos seus dados: ${privacidade}`].join("\n\n"),
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1d2129;max-width:560px">
${paragrafos}<p style="margin:16px 0 20px">— ${escaparHtml(assinatura)}</p>
<p style="margin:0 0 8px;color:#5b616e;font-size:13px">${escaparHtml(motivo)}</p>
<p style="margin:0;color:#5b616e;font-size:13px"><a href="${escaparHtml(privacidade)}" style="color:#0f6e5a">Como cuidamos dos seus dados</a></p>
</div>`,
  };
}
