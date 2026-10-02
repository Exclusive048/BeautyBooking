import { del, get, set } from "@/lib/cache/cache";
import { prisma } from "@/lib/prisma";

/**
 * WELCOME-DIALOG-01 (решение владельца 2026-10-01) — приветствие этапа
 * тестирования: один раз после регистрации, с просьбой присылать замечания.
 *
 * Флаг в `SystemConfig`, переключается в «Системных флагах» админки без
 * деплоя. По умолчанию ВКЛЮЧЁН (строки нет — окно показывается): выключает
 * владелец, когда решит, что этап тестирования закончился.
 *
 * Кому показывать — `welcomePending`: флаг включён и `UserProfile.welcomeSeenAt`
 * пуст. Отметку ставит только закрытие окна (`markWelcomeSeen`,
 * `welcome-seen.ts` — отдельным модулем: админский роут флагов импортирует
 * этот файл, и запись в профиль рядом сделала бы его «пишущим ПДн» для
 * сторожа fail-closed).
 */

export const WELCOME_DIALOG_SYSTEM_CONFIG_KEY = "welcomeDialogEnabled";
export const WELCOME_DIALOG_DEFAULT = true;
const WELCOME_DIALOG_CACHE_KEY = "system:welcome-dialog-enabled";
const WELCOME_DIALOG_CACHE_TTL_SECONDS = 30;

export async function getWelcomeDialogEnabled(): Promise<boolean> {
  const cached = await get<boolean>(WELCOME_DIALOG_CACHE_KEY);
  if (typeof cached === "boolean") return cached;

  const setting = await prisma.systemConfig.findUnique({
    where: { key: WELCOME_DIALOG_SYSTEM_CONFIG_KEY },
    select: { value: true },
  });
  const resolved = typeof setting?.value === "boolean" ? setting.value : WELCOME_DIALOG_DEFAULT;

  await set(WELCOME_DIALOG_CACHE_KEY, resolved, WELCOME_DIALOG_CACHE_TTL_SECONDS);
  return resolved;
}

export async function clearWelcomeDialogEnabledCache(): Promise<void> {
  await del(WELCOME_DIALOG_CACHE_KEY);
}

export function isWelcomePending(enabled: boolean, welcomeSeenAt: Date | null): boolean {
  return enabled && welcomeSeenAt === null;
}
