// Carrega o .env antes de qualquer leitura de process.env.
import "dotenv/config";
import express from "express";
import cors from "cors";
import { publicRoutes } from "./routes/public.routes.js";
import { qrcodesRoutes } from "./routes/qrcodes.routes.js";
import { areasRoutes } from "./routes/areas.routes.js";
import { authRoutes } from "./routes/auth.routes.js";
import { occurrencesRoutes } from "./routes/occurrences.routes.js";
import { notFoundHandler, errorHandler } from "./middlewares/errorHandler.js";

// A aplicação é montada aqui e exportada sem escutar porta, para que os testes
// possam consumi-la direto (Supertest) sem subir um servidor.
export const app = express();

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

// 404 e error handler — sempre por último.
app.use(notFoundHandler);
app.use(errorHandler);
