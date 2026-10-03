import "server-only";

import type { SessionClientType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  unlinkPushDevicesExceptFamily,
  unlinkPushDevicesOfFamilies,
} from "@/lib/notifications/native-push/devices";

/**
 * MOBILE-AUTH-A3 — «Где я вошёл»: активные сессии пользователя и их отзыв.
 *
 * Единица списка — СЕМЬЯ сессий (SEC-13), а не строка `RefreshSession`: каждая
 * ротация создаёт новую строку, а семья — это один вход на одном устройстве.
 * Ключ семьи — `familyId`; у строк, выпущенных до SEC-13, его нет, и семьёй
 * служит id самой строки — ровно так её продолжает ротация
 * (`familyId = claimedSession?.familyId ?? claims.sid` в `rotateSession`).
 *
 * Отзыв гасит ВСЕ строки семьи (`revokedAt`), и это действует сразу и для
 * Bearer, и для куки: access-токен жив, только пока в его семье есть
 * неотозванная строка (`loadActiveSessionUser`). Ждать двух часов TTL не нужно.
 *
 * Активная семья — есть неотозванная строка с неистёкшим сроком, то есть
 * refresh ещё сработает. Мета (клиент, устройство, UA) берётся с самой свежей
 * строки: ротация её наследует, а приложение обновляет версию.
 */

export type SessionFamilySummary = {
  /** Ключ семьи: `familyId` (или id legacy-строки). Его принимает `DELETE`. */
  id: string;
  clientType: SessionClientType;
  platform: string | null;
  deviceName: string | null;
  appVersion: string | null;
  /** Сводка User-Agent для веб-сессий («Chrome, Windows»); у приложения `null`. */
  browser: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  current: boolean;
};

type FamilyRow = {
  id: string;
  familyId: string | null;
  clientType: SessionClientType;
  platform: string | null;
  deviceName: string | null;
  appVersion: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
};

function familyKeyOf(row: { id: string; familyId: string | null }): string {
  return row.familyId ?? row.id;
}

/** Строки семьи по ключу: её `familyId` либо сама legacy-строка без семьи. */
function familyWhere(familyKey: string) {
  return { OR: [{ familyId: familyKey }, { id: familyKey, familyId: null }] };
}

// ── User-Agent → «Chrome, Windows» ───────────────────────────────────────────

/**
 * Порядок важен: Chromium-браузеры несут в UA и `Chrome/`, и `Safari/`, поэтому
 * сначала узнаются «надстройки» (Яндекс, Edge, Opera, Samsung), потом Chrome,
 * и только в конце Safari.
 */
const BROWSER_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/YaBrowser\//, "Яндекс Браузер"],
  [/Edg(?:e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\/|Chromium\//, "Chrome"],
  [/Version\/[\d.]+.*Safari\//, "Safari"],
];

const OS_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Windows NT|Windows Phone/, "Windows"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Linux/, "Linux"],
];

function firstMatch(value: string, patterns: ReadonlyArray<readonly [RegExp, string]>): string | null {
  for (const [pattern, label] of patterns) {
    if (pattern.test(value)) return label;
  }
  return null;
}

/**
 * Короткая сводка User-Agent для человека. Сырой UA наружу не уходит: он
 * длинный, нечитаемый и точнее нужного отпечатывает устройство.
 */
export function summarizeUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const browser = firstMatch(userAgent, BROWSER_PATTERNS);
  const os = firstMatch(userAgent, OS_PATTERNS);
  if (browser && os) return `${browser}, ${os}`;
  return browser ?? os;
}

// ── Список ───────────────────────────────────────────────────────────────────

export async function listActiveSessionFamilies(
  userId: string,
  currentFamilyId: string | null,
): Promise<SessionFamilySummary[]> {
  const now = new Date();
  const rows: FamilyRow[] = await prisma.refreshSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      familyId: true,
      clientType: true,
      platform: true,
      deviceName: true,
      appVersion: true,
      userAgent: true,
      createdAt: true,
      lastUsedAt: true,
    },
  });

  // Самая свежая строка семьи несёт актуальную мету; начало семьи — самая
  // ранняя из живых (строки старше 30 дней уже истекли, точнее не нужно).
  const families = new Map<string, { latest: FamilyRow; createdAt: Date; lastUsedAt: Date | null }>();
  for (const row of rows) {
    const key = familyKeyOf(row);
    const family = families.get(key);
    if (!family) {
      families.set(key, { latest: row, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt });
      continue;
    }
    if (row.createdAt < family.createdAt) family.createdAt = row.createdAt;
    if (row.lastUsedAt && (!family.lastUsedAt || row.lastUsedAt > family.lastUsedAt)) {
      family.lastUsedAt = row.lastUsedAt;
    }
  }

  const activityOf = (family: { createdAt: Date; lastUsedAt: Date | null }) =>
    (family.lastUsedAt ?? family.createdAt).getTime();

  return [...families.entries()]
    .sort(([, a], [, b]) => activityOf(b) - activityOf(a))
    .map(([key, family]) => {
      const { latest } = family;
      const isWeb = latest.clientType === "WEB";
      return {
        id: key,
        clientType: latest.clientType,
        platform: latest.platform,
        deviceName: latest.deviceName,
        appVersion: latest.appVersion,
        browser: isWeb ? summarizeUserAgent(latest.userAgent) : null,
        createdAt: family.createdAt.toISOString(),
        lastUsedAt: family.lastUsedAt?.toISOString() ?? null,
        current: currentFamilyId !== null && key === currentFamilyId,
      };
    });
}

// ── Отзыв ────────────────────────────────────────────────────────────────────

/**
 * Отзыв одной семьи. `false` — у пользователя такой семьи нет и не было
 * (чужая или выдуманная): вызывающий отвечает 404, не раскрывая, чья она.
 * Уже отозванная своя семья — `true`: повтор идемпотентен.
 *
 * MOBILE-B2: в той же транзакции удаляются push-токены установки этой семьи —
 * завершённый вход больше не получает push.
 */
export async function revokeSessionFamily(userId: string, familyKey: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.refreshSession.findFirst({
      where: { userId, ...familyWhere(familyKey) },
      select: { id: true },
    });
    if (!owned) return false;

    await tx.refreshSession.updateMany({
      where: { userId, revokedAt: null, ...familyWhere(familyKey) },
      data: { revokedAt: new Date() },
    });
    await unlinkPushDevicesOfFamilies(tx, userId, [familyKey]);
    return true;
  });
}

/**
 * «Завершить все остальные»: отзывает всё, кроме семьи текущего токена.
 * Возвращает число отозванных АКТИВНЫХ семей (то, что пользователь видел в
 * списке), а не строк.
 *
 * `NOT { familyId: current }` здесь не годится: в SQL `NULL <> x` — не истина,
 * и legacy-строки без семьи молча пережили бы отзыв. Поэтому условие
 * развёрнуто явно. Токен без `fid` (до SEC-13) своей семьи не называет — тогда
 * отзываются все семьи, и этому устройству придётся войти заново.
 *
 * MOBILE-B2: push-токены всех установок, кроме текущей, удаляются в той же
 * транзакции (без `fid` — все: текущий вход тоже не назван).
 */
export async function revokeOtherSessionFamilies(
  userId: string,
  currentFamilyId: string | null,
): Promise<number> {
  const now = new Date();
  const others = currentFamilyId
    ? {
        AND: [
          { OR: [{ familyId: null }, { familyId: { not: currentFamilyId } }] },
          { id: { not: currentFamilyId } },
        ],
      }
    : {};

  return prisma.$transaction(async (tx) => {
    const live = await tx.refreshSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now }, ...others },
      select: { id: true, familyId: true },
    });
    await tx.refreshSession.updateMany({
      where: { userId, revokedAt: null, ...others },
      data: { revokedAt: now },
    });
    await unlinkPushDevicesExceptFamily(tx, userId, currentFamilyId);
    return new Set(live.map(familyKeyOf)).size;
  });
}
