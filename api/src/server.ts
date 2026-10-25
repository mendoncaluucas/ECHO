import { app } from "./app.js";
import { aplicarRetencaoSeDevido } from "./retencao.js";
import { resumoDoEmail } from "./email.js";

const PORT = Number(process.env.PORT) || 3333;

app.listen(PORT, () => {
  console.log(`Echo API rodando em http://localhost:${PORT}`);
  console.log(resumoDoEmail());
});

// Retenção de dados (LGPD): ao ligar e, enquanto a API estiver de pé, de hora em hora.
// Quem decide se é hora (no máximo uma rodada por dia) é o aplicarRetencaoSeDevido.
// Fica aqui, e não no app.ts, para os testes (que importam o app) não dispararem a
// rotina sozinhos. O log do servidor leva só as contagens, nunca o conteúdo.
const UMA_HORA_MS = 60 * 60 * 1000;

async function rodarRetencao() {
  try {
    const resultado = await aplicarRetencaoSeDevido();
    if (resultado) {
      console.log(
        `Retenção aplicada (anonimizados): contatos ${resultado.contatos}, ` +
          `comentários ${resultado.comentarios}, notificações apagadas ${resultado.notificacoes}`
      );
    }
  } catch (erro) {
    // Uma falha aqui não pode derrubar a API: tenta de novo na próxima hora.
    console.error("Retenção não aplicada:", erro);
  }
}

void rodarRetencao();
// unref: o relógio não segura o processo de pé sozinho (encerrar a API encerra).
setInterval(() => void rodarRetencao(), UMA_HORA_MS).unref();
