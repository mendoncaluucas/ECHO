import express from "express";
import cors from "cors";
import { publicRoutes } from "./routes/public.routes.js";
import { qrcodesRoutes } from "./routes/qrcodes.routes.js";
import { authRoutes } from "./routes/auth.routes.js";
import { occurrencesRoutes } from "./routes/occurrences.routes.js";
import { notFoundHandler, errorHandler } from "./middlewares/errorHandler.js";

const app = express();

// CORS restrito a CORS_ORIGIN (lista separada por vírgula); sem a variável, libera todas as origens.
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin.split(",") } : undefined));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "echo-api" });
});

app.use("/api/public", publicRoutes);
app.use("/api/qrcodes", qrcodesRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/occurrences", occurrencesRoutes);

// 404 e error handler — sempre por último.
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3333;

app.listen(PORT, () => {
  console.log(`Echo API rodando em http://localhost:${PORT}`);
});
