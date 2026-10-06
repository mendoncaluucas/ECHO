-- AlterEnum
ALTER TYPE "AcaoAuditoria" ADD VALUE 'CONFIGURACAO_ALTERADA';

-- CreateTable
CREATE TABLE "Configuracao" (
    "id" TEXT NOT NULL DEFAULT 'sistema',
    "duracaoSessaoHoras" INTEGER NOT NULL DEFAULT 8,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuracao_pkey" PRIMARY KEY ("id")
);
