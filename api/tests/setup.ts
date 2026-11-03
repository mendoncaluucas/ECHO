import { afterAll, beforeEach } from "vitest";
import { prisma } from "../src/prisma.js";
import { usarProvedorDeEmail } from "../src/email.js";
import { zerarLimites } from "../src/limites.js";
import { limparCacheDeImagens } from "../src/routes/qrcodes.routes.js";

// Cada teste começa com o banco vazio: sem isso, um teste enxerga o que o anterior gravou.
// CASCADE resolve a ordem das chaves estrangeiras.
beforeEach(async () => {
  // E-mail desligado por padrão; quem testa o envio liga um provedor falso.
  usarProvedorDeEmail(null);
  // Cada teste começa com os limites zerados e sem imagem de QR guardada: um caso não
  // pode herdar a contagem nem o cache do anterior.
  zerarLimites();
  limparCacheDeImagens();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "RespostaPronta", "Configuracao", "Notification","AuditLog","FeedbackRating", "Feedback", "QRCode", "Area", "Venue", "Category", "User" RESTART IDENTITY CASCADE'
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});
