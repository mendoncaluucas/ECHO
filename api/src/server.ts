import express from "express";
import cors from "cors";
import { publicRoutes } from "./routes/public.routes.js";
import { qrcodesRoutes } from "./routes/qrcodes.routes.js";
import { authRoutes } from "./routes/auth.routes.js";
import { occurrencesRoutes } from "./routes/occurrences.routes.js";
import { notFoundHandler, errorHandler } from "./middlewares/errorHandler.js";

const app = express();

// CORS: se CORS_ORIGIN estiver definido (uma ou mais origens separadas por vírgula),
// restringe a elas; senão, libera geral (conveniente para desenvolvimento).
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin.split(",") } : undefined));
app.use(express.json());

// Health check — não depende do banco, confirma que a API está de pé.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "echo-api" });
});

// Rotas do MVP (cada arquivo tem um dono — evita conflito trabalhando em dois)
app.use("/api/public", publicRoutes); // Lucas  — fluxo do cliente (sem login)
app.use("/api/qrcodes", qrcodesRoutes); // Lucas  — geração de QR Code
app.use("/api/auth", authRoutes); // Victor — autenticação
app.use("/api/occurrences", occurrencesRoutes); // Victor — gestão (protegido)

// 404 e tratamento de erro global — sempre por último.
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3333;

app.listen(PORT, () => {
  console.log(`Echo API rodando em http://localhost:${PORT}`);
});
