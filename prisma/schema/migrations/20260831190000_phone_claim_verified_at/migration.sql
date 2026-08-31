-- PHONE-CLAIM-01 — «заявка ≠ владение» для телефона (зеркало инв. #41 / EMAIL-ADDRESS-OCCUPATION).
-- Колонка — отметка ДОКАЗАННОГО владения номером; ставит её только phone-OTP-вход.
-- Любая запись phone из кабинета (/api/me, /api/cabinet/user/profile) — заявка и
-- обязана оставлять phoneVerifiedAt = NULL. Уникальность phone остаётся полной:
-- заявка занимает слот, но отпускается доказательством (releaseUnverifiedPhoneClaims).
ALTER TABLE "UserProfile" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

-- Бэкфилл. На дату миграции UserProfile.phone писали только: (а) phone-OTP-вход —
-- доказательство; (б) гостевой checkout — заявка без доказательства, строки
-- guest-class; (в) сиды; (г) VK-колбэк (заявка провайдера, но такие строки не
-- guest-class — принимаем «владение» осознанно: прод-БД на дату миграции НЕ
-- существует (pre-launch), риск ограничен dev-базами). PATCH /api/me телефон не
-- пишет с SECURITY-EXPOSURE-AUDIT-01 #2 (2026-07-27). Поэтому владение получает
-- всякая строка, НЕ являющаяся guest-class; предикат дословно повторяет
-- isGuestClassProfile (src/lib/legal/consent.ts). Guest-class строки остаются
-- заявками — их легализует первый phone-OTP-вход (конверсия гостя).
UPDATE "UserProfile" u
SET "phoneVerifiedAt" = u."createdAt"
WHERE u."phone" IS NOT NULL
  AND NOT (
    u."roles" = ARRAY['CLIENT']::"AccountType"[]
    AND u."email" IS NULL
    AND u."emailVerifiedAt" IS NULL
    AND u."telegramId" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "RefreshSession" r WHERE r."userId" = u."id")
    AND NOT EXISTS (SELECT 1 FROM "VkLink" v WHERE v."userId" = u."id")
    AND NOT EXISTS (SELECT 1 FROM "YandexLink" y WHERE y."userId" = u."id")
  );
