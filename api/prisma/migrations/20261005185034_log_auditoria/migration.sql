-- CreateEnum
CREATE TYPE "AcaoAuditoria" AS ENUM ('LOGIN', 'SENHA_ALTERADA', 'SENHA_REDEFINIDA', 'USUARIO_CRIADO', 'USUARIO_EDITADO', 'USUARIO_DESATIVADO', 'USUARIO_REATIVADO', 'AREA_CRIADA', 'AREA_RENOMEADA', 'AREA_DESATIVADA', 'AREA_REATIVADA', 'QRCODE_GERADO', 'OCORRENCIA_STATUS');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "acao" "AcaoAuditoria" NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "detalhes" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_criadoEm_idx" ON "AuditLog"("criadoEm");

-- CreateIndex
CREATE INDEX "AuditLog_usuarioId_criadoEm_idx" ON "AuditLog"("usuarioId", "criadoEm");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
