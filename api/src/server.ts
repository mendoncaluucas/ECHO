import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

// Health check — não depende do banco, serve para confirmar que a API está de pé.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "echo-api" });
});

// TODO (Bloco 2): montar as rotas do MVP aqui.
//   GET  /api/public/venue/:qrToken   (Lucas)
//   POST /api/public/feedback         (Lucas)
//   POST /api/auth/login              (Victor)
//   GET  /api/occurrences             (Victor)

const PORT = Number(process.env.PORT) || 3333;

app.listen(PORT, () => {
  console.log(`Echo API rodando em http://localhost:${PORT}`);
});
