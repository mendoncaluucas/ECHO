-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_usuarioId_lida_criadoEm_idx" ON "Notification"("usuarioId", "lida", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_usuarioId_feedbackId_key" ON "Notification"("usuarioId", "feedbackId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
