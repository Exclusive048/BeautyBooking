-- STUDIO-INVITE-EMAIL-01 — приглашение в студию по почте ИЛИ по телефону.
--
-- До этого приглашение адресовалось только телефону, а право на него даёт лишь
-- ДОКАЗАННОЕ владение номером (инв. #46, phone-OTP). SMS-шлюза в проде нет,
-- поэтому подтверждённых номеров нет ни у кого, и приглашение мастеру не
-- доходило вовсе (жалоба тестировщика: «не пришло приглашение, хотя номер в
-- профиле прописан» — номер в профиле это заявка, не владение). Почта в проде
-- подтверждается самим входом (email-OTP), поэтому приглашение по ней
-- доходит. Ровно одно из двух полей заполнено — это проверяет схема создания.
--
-- SQL — вывод `prisma migrate diff` без `DROP INDEX "media_asset_embeddings_
-- embedding_hnsw_idx"`: этот индекс Prisma не выражает и предлагает снести в
-- каждой новой миграции (реестр `scripts/raw-sql-objects.mjs`, гейт
-- `check:migration-drops`).

-- AlterTable
ALTER TABLE "StudioInvite" ADD COLUMN     "email" TEXT,
ALTER COLUMN "phone" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "StudioInvite_email_idx" ON "StudioInvite"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StudioInvite_studioId_email_key" ON "StudioInvite"("studioId", "email");
