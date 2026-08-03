import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import type { Browser, BrowserContext, Page } from "@playwright/test";

import { loginAs } from "./login";
import { clearOtpRateLimit } from "./otp";
import type { Role } from "./roles";

/**
 * GATES-FIX-01 — переиспользование сессии вместо повторного логина.
 *
 * ## Проблема
 *
 * Каждый живой логин — это OTP-запрос, а `OTP_REQUEST_IP_LIMIT` = 5 за 60 с на
 * IP. Спека, которая логинится под двумя-тремя ролями, съедает окно и падает на
 * ровном месте (так упал прогон в RKN-FIX-10). Продуктовый лимит при этом
 * правильный — чинить надо харнесс, а не лимит, и уж точно не заводить
 * dev-only обход в `src/`: паритет dev/prod важнее удобства тестов.
 *
 * ## Решение
 *
 * `.qa/smoke.spec.ts` — единственное место, которое логинится «вхолодную», и
 * оно же сохраняет `storageState` в `.qa/auth/<role>.json`. Все остальные
 * спеки берут готовое состояние отсюда и **не тратят OTP вообще**.
 *
 * Сознательно оставлено: smoke по-прежнему делает полный холодный логин каждой
 * роли на каждом прогоне. Иначе переиспользование состояния замаскировало бы
 * реальную регрессию логина — мы бы годами гоняли зелёные тесты по сохранённой
 * куке, не замечая, что войти уже нельзя.
 */

const AUTH_DIR = path.join(process.cwd(), ".qa", "auth");

/** Сколько живёт сохранённое состояние, прежде чем считать его протухшим. */
const MAX_STATE_AGE_MS = 90 * 60 * 1000; // access-token живёт 2 ч — берём с запасом

export function storageStatePath(role: Role): string {
  return path.join(AUTH_DIR, `${role.key}.json`);
}

/** Есть ли пригодное сохранённое состояние (существует, свежее, не пустое). */
export function hasFreshStorageState(role: Role): boolean {
  const file = storageStatePath(role);
  if (!existsSync(file)) return false;
  try {
    if (Date.now() - statSync(file).mtimeMs > MAX_STATE_AGE_MS) return false;
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    // Пустой `cookies: []` — это «логин не удался, но файл записался».
    return Array.isArray(parsed?.cookies) && parsed.cookies.length > 0;
  } catch {
    return false;
  }
}

export type RoleContext = {
  context: BrowserContext;
  page: Page;
  /** true — сессию переиспользовали; false — пришлось логиниться вживую. */
  reused: boolean;
};

/**
 * Контекст под ролью: из сохранённого состояния, если оно свежее, иначе —
 * один живой логин (с предварительным сбросом окна, чтобы этот единственный
 * логин не упёрся в остаток чужого счётчика).
 *
 * Вызывающий обязан закрыть `context`.
 */
export async function contextForRole(
  browser: Browser,
  role: Role,
  baseURL: string,
  options?: { forceFreshLogin?: boolean },
): Promise<RoleContext> {
  mkdirSync(AUTH_DIR, { recursive: true });
  const viewport = { width: 1440, height: 900 };

  if (!options?.forceFreshLogin && hasFreshStorageState(role)) {
    const context = await browser.newContext({
      viewport,
      storageState: storageStatePath(role),
    });
    return { context, page: await context.newPage(), reused: true };
  }

  clearOtpRateLimit([role.phone]);
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await loginAs(page, role, baseURL);
  await context.storageState({ path: storageStatePath(role) });
  return { context, page, reused: false };
}
