import type { Request, Response } from "express";
import { MemoryStore, rateLimit, type AugmentedRequest } from "express-rate-limit";

// Limite de requisições por IP. Ver docs/PROXIMOS-PASSOS.md, seção 8.
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

function criarLimite({ janelaMs, maximo, mensagem }: { janelaMs: number; maximo: number; mensagem: string }) {
  const memoria = new MemoryStore();
  memorias.push(memoria);
  return rateLimit({
    windowMs: janelaMs,
    limit: maximo,
    store: memoria,
    // RateLimit-Limit / -Remaining / -Reset em cabeçalhos separados, e Retry-After no 429.
    standardHeaders: "draft-6",
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      const fim = (req as AugmentedRequest).rateLimit?.resetTime?.getTime() ?? Date.now() + janelaMs;
      // O front não lê o Retry-After (vem de outro endereço); o tempo vai no corpo.
      res.status(429).json({
        erro: mensagem,
        codigo: "MUITAS_REQUISICOES",
        tenteEmSegundos: Math.max(1, Math.ceil((fim - Date.now()) / 1000)),
      });
    },
  });
}

// Imagem do QR Code: pública e cara de gerar (ocupa o processador). 60 por minuto
// sobra para a tela de QR Codes, que carrega uma por área de uma vez, e corta script e
// clique em série no "Baixar PNG".
export const limiteDaImagemDoQr = criarLimite({
  janelaMs: 60 * 1000,
  maximo: 60,
  mensagem: "Muitos downloads seguidos. Espere um minuto e tente de novo.",
});
