-- CreateEnum
CREATE TYPE "StatusOcorrencia" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'RESOLVIDO');

-- AlterTable
ALTER TABLE "Feedback" ADD COLUMN     "status" "StatusOcorrencia" NOT NULL DEFAULT 'PENDENTE',
ADD COLUMN     "tratadoEm" TIMESTAMP(3),
ADD COLUMN     "tratadoPorId" TEXT;

-- CreateIndex
CREATE INDEX "Feedback_status_idx" ON "Feedback"("status");

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_tratadoPorId_fkey" FOREIGN KEY ("tratadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
