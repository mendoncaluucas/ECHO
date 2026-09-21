import { afterAll, beforeEach } from "vitest";
import { prisma } from "../src/prisma.js";

// Cada teste começa com o banco vazio: sem isso, um teste enxerga o que o anterior gravou.
// CASCADE resolve a ordem das chaves estrangeiras.
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "FeedbackRating", "Feedback", "QRCode", "Area", "Venue", "Category", "User" RESTART IDENTITY CASCADE'
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});
