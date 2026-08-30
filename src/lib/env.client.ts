/**
 * ENV-SPLIT-01 — ФРОНТ-половина env. Единственный env-модуль, который можно
 * импортировать из кода, попадающего в браузерный бандл: `"use client"`-файлы,
 * `src/instrumentation-client.ts`, `observability/browser|config.client`.
 *
 * Серверная половина — `src/lib/env.ts`. Она несёт `import "server-only"` и
 * РОНЯЕТ СБОРКУ при попытке утащить её в клиентский бандл. Это и есть граница
 * бэк/фронт, раньше державшаяся на `typeof window`-акробатике внутри одного
 * модуля (QA-108) — со всеми её фолбэками и хождением клиентского кода по
 * серверным экспортам.
 *
 * QA-001 / FIX-09 — каждая переменная обязана быть ЛИТЕРАЛОМ
 * `process.env.NEXT_PUBLIC_X`: webpack статически инлайнит только этот точный
 * текст. Никаких `process.env as ...`-алиасов, спредов и динамических ключей.
 *
 * ⚠️ Список ниже — канонический перечень публичных переменных. Он обязан
 * оставаться в локстепе с: ARG-блоком Dockerfile, args сервиса `app` в
 * docker-compose.prod.yml и заглушками build-images.yml. Пропущенная в
 * build-args переменная запекается в бандл ПУСТОЙ без единой ошибки
 * (прецедент DOCKER-READINESS-AUDIT-01).
 *
 * Значения тут — сырые строки (без Zod): в браузере валидировать нечего,
 * сервер валидирует свою копию в env.ts.
 */

export const clientEnv = {
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  NEXT_PUBLIC_YANDEX_MAPS_API_KEY: process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY,
  NEXT_PUBLIC_LEGAL_INN: process.env.NEXT_PUBLIC_LEGAL_INN,
  NEXT_PUBLIC_VK_COMMUNITY_URL: process.env.NEXT_PUBLIC_VK_COMMUNITY_URL,
  NEXT_PUBLIC_GLITCHTIP_DSN: process.env.NEXT_PUBLIC_GLITCHTIP_DSN,
  NEXT_PUBLIC_GLITCHTIP_ENVIRONMENT: process.env.NEXT_PUBLIC_GLITCHTIP_ENVIRONMENT,
  NEXT_PUBLIC_GLITCHTIP_RELEASE: process.env.NEXT_PUBLIC_GLITCHTIP_RELEASE,
};

/** Инлайнится в "production" в прод-бандле — на нём держится DCE dev-веток. */
export const isProduction = process.env.NODE_ENV === "production";

/**
 * ENV-SPLIT-01: фиче-флагов больше нет — фича включена, когда она
 * СКОНФИГУРИРОВАНА. Telegram в UI показывается, если задан username бота
 * (бывший NEXT_PUBLIC_TELEGRAM_ENABLED удалён). Серверная половина требует
 * TELEGRAM_BOT_TOKEN рефайном, когда username задан в проде, — половинчатая
 * конфигурация валит старт, а не молча ломает виджет.
 *
 * Обязан давать тот же ответ, что серверный `isTelegramEnabled` в env.ts
 * (иначе hydration mismatch на гейтящихся секциях).
 */
export const isTelegramEnabled = Boolean(
  clientEnv.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim()
);

/**
 * OBSERVABILITY-GLITCHTIP-01 — браузерный трекинг включён самим наличием DSN.
 * Инлайнится на сборке: без DSN webpack выкидывает и гейт, и динамический
 * импорт SDK из бандла (см. src/instrumentation-client.ts).
 */
export const isBrowserErrorTrackingEnabled = Boolean(
  clientEnv.NEXT_PUBLIC_GLITCHTIP_DSN?.trim()
);
