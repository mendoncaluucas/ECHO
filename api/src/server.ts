import express from "express";
import cors from "cors";
import { publicRoutes } from "./routes/public.routes.js";
import { authRoutes } from "./routes/auth.routes.js";
import { occurrencesRoutes } from "./routes/occurrences.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

// Health check — não depende do banco, confirma que a API está de pé.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "echo-api" });
});

// Rotas do MVP (cada arquivo tem um dono — evita conflito trabalhando em dois)
app.use("/api/public", publicRoutes); // Lucas  — fluxo do cliente (sem login)
app.use("/api/auth", authRoutes); // Victor — autenticação
app.use("/api/occurrences", occurrencesRoutes); // Victor — gestão (protegido)

const PORT = Number(process.env.PORT) || 3333;

app.listen(PORT, () => {
  console.log(`Echo API rodando em http://localhost:${PORT}`);
});
