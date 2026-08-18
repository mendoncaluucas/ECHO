import { PrismaClient } from "@prisma/client";

// Client único do Prisma, reutilizado em toda a API.
export const prisma = new PrismaClient();
