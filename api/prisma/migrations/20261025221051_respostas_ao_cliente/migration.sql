-- AlterEnum
ALTER TYPE "AcaoAuditoria" ADD VALUE 'RESPOSTA_ENVIADA';

-- CreateTable
CREATE TABLE "Resposta" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "texto" TEXT,
    "textoApagadoEm" TIMESTAMP(3),
    "enviadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resposta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Resposta_feedbackId_enviadaEm_idx" ON "Resposta"("feedbackId", "enviadaEm");

-- AddForeignKey
ALTER TABLE "Resposta" ADD CONSTRAINT "Resposta_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resposta" ADD CONSTRAINT "Resposta_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
