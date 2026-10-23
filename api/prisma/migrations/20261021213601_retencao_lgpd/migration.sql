-- Retenção de dados (LGPD). Ver docs/PROXIMOS-PASSOS.md, seção 6.
--
-- Dois valores no mesmo enum numa migration: o Postgres aceita desde a versão 12, desde
-- que nenhum dos dois seja usado nesta transação. A 20261007172047_qrcode_desativar fez o
-- mesmo e rodou no Neon.

-- AlterEnum
ALTER TYPE "AcaoAuditoria" ADD VALUE 'RETENCAO_APLICADA';
ALTER TYPE "AcaoAuditoria" ADD VALUE 'DADOS_DO_TITULAR_APAGADOS';

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "usuarioId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Configuracao" ADD COLUMN     "retencaoComentarioDias" INTEGER NOT NULL DEFAULT 365,
ADD COLUMN     "retencaoContatoDias" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "retencaoNotificacaoDias" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "ultimaRetencaoEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Feedback" ADD COLUMN     "comentarioApagadoEm" TIMESTAMP(3),
ADD COLUMN     "contatoApagadoEm" TIMESTAMP(3);
