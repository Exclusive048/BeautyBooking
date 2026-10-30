/**
 * USER-BLOCKING-01 — client-safe половина `account-block.ts`: ключ отказа
 * входа заблокированному. Его ставят веб-колбэки OAuth и Telegram
 * (`/login?error=`) и колбэк приложения (`masterryadom://auth/callback?error=`),
 * а читает `login-client.tsx` — поэтому без серверных зависимостей.
 */
export const ACCOUNT_BLOCKED_REDIRECT_ERROR = "account_blocked";
