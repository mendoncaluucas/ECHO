import type { Request, Response } from "express";
import { MemoryStore, rateLimit, type AugmentedRequest } from "express-rate-limit";

// Limite de requisições, por IP ou por conta. Ver docs/PROXIMOS-PASSOS.md, seção 8.
//
// Guardado na memória da API: o Render roda uma instância só. Zera quando ela dorme,
// o que não ajuda ataque nenhum (um ataque a mantém acordada).
//
// O IP é o do cliente só com o `trust proxy` certo (app.ts): sem ele, todo pedido no
// Render parece vir do proxy, e o limite cairia sobre todos juntos.

// As memórias de cada limite, para os testes zerarem entre um caso e outro.
const memorias: MemoryStore[] = [];

export function zerarLimites() {
  for (const memoria of memorias) memoria.resetAll();
}

// "40 segundos", "1 minuto", "12 minutos": para a mensagem dizer quanto esperar.
export function descreverEspera(segundos: number) {
  if (segundos < 60) return segundos === 1 ? "1 segundo" : `${segundos} segundos`;
  const minutos = Math.ceil(segundos / 60);
  return minutos === 1 ? "1 minuto" : `${minutos} minutos`;
}

interface OpcoesDoLimite {
  janelaMs: number;
  maximo: number;
  // Texto fixo, ou montado com quanto falta ("Tente de novo em 12 minutos.").
  mensagem: string | ((espera: string) => string);
  // De quem é a conta. Sem isto, do IP. null: o pedido não entra neste limite.
  chave?: (req: Request) => string | null;
  // Só as falhas contam (login: entrar com a senha certa não gasta tentativa).
  soFalhas?: boolean;
}

// Sem o "só o que deu certo conta" da biblioteca (skipFailedRequests) de propósito: ela
// devolve a vez também quando a conexão cai antes da resposta, e quem corta a conexão
// logo depois de pedir escaparia do limite com o pedido já feito. Para devolver a vez de
// quem não gastou nada, a rota chama `devolver` (ver limiteDasRespostas).
function criarLimite({ janelaMs, maximo, mensagem, chave, soFalhas }: OpcoesDoLimite) {
  const memoria = new MemoryStore();
  memorias.push(memoria);
  const limite = rateLimit({
    windowMs: janelaMs,
    limit: maximo,
    store: memoria,
    // RateLimit-Limit / -Remaining / -Reset em cabeçalhos separados, e Retry-After no 429.
    standardHeaders: "draft-6",
    legacyHeaders: false,
    ...(chave && { keyGenerator: (req: Request) => chave(req)!, skip: (req: Request) => chave(req) === null }),
    skipSuccessfulRequests: soFalhas ?? false,
    handler: (req: Request, res: Response) => {
      const fim = (req as AugmentedRequest).rateLimit?.resetTime?.getTime() ?? Date.now() + janelaMs;
      const segundos = Math.max(1, Math.ceil((fim - Date.now()) / 1000));
      // O front não lê o Retry-After (vem de outro endereço); o tempo vai no corpo.
      res.status(429).json({
        erro: typeof mensagem === "string" ? mensagem : mensagem(descreverEspera(segundos)),
        codigo: "MUITAS_REQUISICOES",
        tenteEmSegundos: segundos,
      });
    },
  });
  // Devolve a vez de um pedido que passou pelo limite e não gastou nada. Só nos limites
  // com `chave` (a conta do IP não tem uso para isto).
  const devolver = (req: Request) => {
    const conta = chave?.(req);
    if (conta) void memoria.decrement(conta);
  };
  return Object.assign(limite, { devolver });
}

// Imagem do QR Code: pública e cara de gerar (ocupa o processador). 60 por minuto
// sobra para a tela de QR Codes, que carrega uma por área de uma vez, e corta script e
// clique em série no "Baixar PNG".
export const limiteDaImagemDoQr = criarLimite({
  janelaMs: 60 * 1000,
  maximo: 60,
  mensagem: "Muitos downloads seguidos. Espere um minuto e tente de novo.",
});

const QUINZE_MINUTOS = 15 * 60 * 1000;
const tentativaDeEntrar = (espera: string) => `Muitas tentativas de entrar. Tente de novo em ${espera}.`;

// Login, por IP: 10 tentativas em 15 minutos, certas ou erradas. Corta quem testa senhas
// de muitas contas a partir do mesmo lugar.
export const limiteDoLoginPorIp = criarLimite({
  janelaMs: QUINZE_MINUTOS,
  maximo: 10,
  mensagem: tentativaDeEntrar,
});

// Login, por e-mail: 5 senhas erradas em 15 minutos, de qualquer IP. Corta quem testa
// senhas de uma conta trocando de IP. Entrar com a senha certa não conta, e o bloqueio
// é temporário de propósito: permanente, um atacante trancaria o administrador do lado
// de fora só errando a senha dele. A mesma mensagem do limite por IP: não diz se o
// e-mail tem cadastro (a conta é por e-mail digitado, exista ou não).
export const limiteDoLoginPorEmail = criarLimite({
  janelaMs: QUINZE_MINUTOS,
  maximo: 5,
  mensagem: tentativaDeEntrar,
  soFalhas: true,
  chave: (req) => {
    const email = req.body?.email;
    return typeof email === "string" && email.trim() ? `email:${email.trim().toLowerCase()}` : null;
  },
});

// Feedback do cliente, por IP: 20 a cada 10 minutos. Generoso de propósito: no Wi-Fi do
// restaurante, todas as mesas saem pelo mesmo IP. Cada feedback grava no banco, toca o
// sino de toda a equipe e pode virar e-mail.
export const limiteDoFeedback = criarLimite({
  janelaMs: 10 * 60 * 1000,
  maximo: 20,
  mensagem: (espera) => `Muitas avaliações enviadas desta rede em pouco tempo. Tente de novo em ${espera}.`,
});

// Abertura do formulário pelo QR, por IP: 60 por minuto. Sobra para um restaurante
// cheio no mesmo Wi-Fi e dificulta testar códigos em sequência atrás de um QR válido.
export const limiteDoFormulario = criarLimite({
  janelaMs: 60 * 1000,
  maximo: 60,
  mensagem: (espera) => `Muitos acessos seguidos desta rede. Tente de novo em ${espera}.`,
});

// Resposta ao cliente por e-mail, por pessoa da equipe: 20 por hora. Conta invadida não
// vira disparador de e-mail. Só as que saíram contam: a rota devolve a vez quando
// recusa ou quando o provedor falha (`limiteDasRespostas.devolver`). Depois do
// requireAuth, que preenche req.usuario.
export const limiteDasRespostas = criarLimite({
  janelaMs: 60 * 60 * 1000,
  maximo: 20,
  mensagem: (espera) => `Você enviou muitas respostas na última hora. Tente de novo em ${espera}.`,
  chave: (req) => (req.usuario ? `usuario:${req.usuario.sub}` : null),
});
