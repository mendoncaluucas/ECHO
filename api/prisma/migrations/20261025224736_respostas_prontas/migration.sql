-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AcaoAuditoria" ADD VALUE 'RESPOSTA_PRONTA_CRIADA';
ALTER TYPE "AcaoAuditoria" ADD VALUE 'RESPOSTA_PRONTA_EDITADA';
ALTER TYPE "AcaoAuditoria" ADD VALUE 'RESPOSTA_PRONTA_DESATIVADA';
ALTER TYPE "AcaoAuditoria" ADD VALUE 'RESPOSTA_PRONTA_REATIVADA';

-- CreateTable
CREATE TABLE "RespostaPronta" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RespostaPronta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RespostaPronta_titulo_key" ON "RespostaPronta"("titulo");
