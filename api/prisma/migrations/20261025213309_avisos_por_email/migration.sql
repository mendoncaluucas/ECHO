-- CreateEnum
CREATE TYPE "AvisoPorEmail" AS ENUM ('NENHUM', 'RECLAMACOES', 'TODOS');

-- AlterEnum
ALTER TYPE "AcaoAuditoria" ADD VALUE 'AVISO_POR_EMAIL_ALTERADO';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avisoPorEmail" "AvisoPorEmail" NOT NULL DEFAULT 'RECLAMACOES';
