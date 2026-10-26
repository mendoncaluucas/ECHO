import { afterAll, beforeEach } from "vitest";
import { prisma } from "../src/prisma.js";
import { usarProvedorDeEmail } from "../src/email.js";

// Cada teste começa com o banco vazio: sem isso, um teste enxerga o que o anterior gravou.
// CASCADE resolve a ordem das chaves estrangeiras.
beforeEach(async () => {
  // E-mail desligado por padrão; quem testa o envio liga um provedor falso.
  usarProvedorDeEmail(null);
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "RespostaPronta", "Configuracao", "Notification","AuditLog","FeedbackRating", "Feedback", "QRCode", "Area", "Venue", "Category", "User" RESTART IDENTITY CASCADE'
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});
