// Carrega o .env antes de qualquer leitura de process.env.
import "dotenv/config";

// Os filtros `de`/`ate` falam em dias do restaurante, não do servidor. O Render roda em
// UTC: sem isto, "até 05/10" terminava às 20:59 de Brasília e deixava o jantar de fora.
// Atribuir o TZ com o processo já de pé vale no Node desde a v13.
process.env.TZ ??= "America/Sao_Paulo";

import express from "express";
import cors from "cors";
import { publicRoutes } from "./routes/public.routes.js";
import { qrcodesRoutes } from "./routes/qrcodes.routes.js";
import { areasRoutes } from "./routes/areas.routes.js";
import { authRoutes } from "./routes/auth.routes.js";
import { occurrencesRoutes } from "./routes/occurrences.routes.js";
import { metricsRoutes } from "./routes/metrics.routes.js";
import { usersRoutes } from "./routes/users.routes.js";
import { auditRoutes } from "./routes/audit.routes.js";
import { notificationsRoutes } from "./routes/notifications.routes.js";
import { configuracoesRoutes } from "./routes/configuracoes.routes.js";
import { categoriasRoutes } from "./routes/categorias.routes.js";
import { retencaoRoutes } from "./routes/retencao.routes.js";
import { respostasProntasRoutes } from "./routes/respostas-prontas.routes.js";
import { notFoundHandler, errorHandler } from "./middlewares/errorHandler.js";

// A aplicação é montada aqui e exportada sem escutar porta, para que os testes
// possam consumi-la direto (Supertest) sem subir um servidor.
export const app = express();

// Quantos proxies há entre o cliente e a API (TRUST_PROXY). No Render há pelo menos um,
// e o IP do cliente chega no X-Forwarded-For; sem isto, todo pedido parece vir do
// proxy, e o limite de requisições (src/limites.ts) cairia sobre todos juntos. Número,
// e não "true": o proxy do Render acrescenta ao X-Forwarded-For o que o cliente
// mandou, e "true" deixaria qualquer um escolher o próprio IP. Sem a variável (na
// máquina de quem desenvolve), não confia em proxy nenhum. Ver docs/DEPLOY.md
//
// Valor inválido não derruba a API (ao contrário do JWT_SECRET): no Render, mudar a
// variável reinicia o serviço, e um "true" digitado deixaria o Echo inteiro fora do ar
// por causa de um limite. Fica o erro no log e segue sem confiar em proxy.
export function lerTrustProxy(): number {
  const valor = process.env.TRUST_PROXY?.trim();
  if (!valor) return 0;
  const saltos = Number(valor);
  if (!Number.isInteger(saltos) || saltos < 0 || saltos > 5) {
    console.error(`TRUST_PROXY ignorado: deve ser um número de 0 a 5 (veio "${valor}"). Seguindo com 0.`);
    return 0;
  }
  return saltos;
}
app.set("trust proxy", lerTrustProxy());

// CORS restrito a CORS_ORIGIN (lista separada por vírgula); sem a variável, libera todas as origens.
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin.split(",") } : undefined));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "echo-api" });
});

app.use("/api/public", publicRoutes);
app.use("/api/qrcodes", qrcodesRoutes);
app.use("/api/areas", areasRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/occurrences", occurrencesRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/configuracoes", configuracoesRoutes);
app.use("/api/categorias", categoriasRoutes);
app.use("/api/retencao", retencaoRoutes);
app.use("/api/respostas-prontas", respostasProntasRoutes);

// 404 e error handler — sempre por último.
app.use(notFoundHandler);
app.use(errorHandler);
