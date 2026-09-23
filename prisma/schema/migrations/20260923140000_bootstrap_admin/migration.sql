-- BOOTSTRAP-ADMIN-01 (решение владельца 2026-09-23) — аккаунт
-- dmitriev_ar@masterryadom.ru всегда администратор платформы.
--
-- Миграция даёт роль сразу, если аккаунт уже есть. «Всегда» держит шаг деплоя
-- `npm run deploy:post` (scripts/post-deploy.ts → ensureBootstrapAdmins,
-- список — src/lib/auth/bootstrap-admins.ts): он повторяет выдачу на каждом
-- деплое, в том числе для аккаунта, заведённого позже этой миграции.
--
-- 🔴 Только ПОДТВЕРЖДЁННЫЙ адрес (`emailVerifiedAt`, ставит его лишь успешно
-- введённый код — инв. #41). Вписать адрес себе в профиль может кто угодно, и
-- без этого условия такая заявка давала бы админку.
UPDATE "UserProfile"
SET "roles" = array_append("roles", 'ADMIN'::"AccountType")
WHERE lower("email") = 'dmitriev_ar@masterryadom.ru'
  AND "emailVerifiedAt" IS NOT NULL
  AND "isDeleted" = false
  AND NOT ('ADMIN'::"AccountType" = ANY("roles"));
