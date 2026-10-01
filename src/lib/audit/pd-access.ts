import "server-only";

import { PdAccessActorType } from "@prisma/client";
import { getRequestId, logError } from "@/lib/logging/logger";
import {
  COMPLIANCE_FINGERPRINTS,
  reportComplianceWriteFailure,
} from "@/lib/observability/compliance";
import { prisma } from "@/lib/prisma";

/**
 * RKN-FIX-10 — единственный writer следа массовых чтений ПДн.
 *
 * ## Зачем
 *
 * `RKN-COMPLIANCE-REPORT.md` §3 п.7: мутации аудируются (инв. #16/#18/#19),
 * auth-события логируются, а **чтения невидимы**. Скомпрометированный
 * админский или мастерский аккаунт мог пролистать всю клиентскую базу, и на
 * вопрос РКН «чьи данные и в каком объёме» (24 ч на уведомление, 72 на
 * результаты расследования — 152-ФЗ ст. 21 ч. 3.1) ответить было бы нечем.
 *
 * ## Что это НЕ
 *
 * **Этот модуль — scoping, а не детект.** Таблица отвечает на вопрос «что читал
 * актор X в окне Y» постфактум. Детект поверх неё — отдельный модуль
 * `lib/audit/pd-access-anomaly.ts` (29.09 доработки · 16): воркер раз в 15 минут
 * сравнивает последний час с порогами; сначала — режим наблюдения (только лог).
 *
 * ## Правило, которое нельзя нарушать
 *
 * 🔴 **В след не попадают прочитанные данные.** Только личность актора, ключ
 * поверхности, тип сущности, СЧЁТЧИК и ФОРМА фильтра. Журнал, защищающий ПДн,
 * не должен становиться второй копией этих ПДн — иначе он удваивает
 * поверхность утечки вместо того, чтобы её сужать. Поэтому
 * `buildFilterFingerprint` принимает только имена фильтров и флаги, и
 * физически не умеет принять значение.
 *
 * ## Семантика отказа
 *
 * Запись **никогда не роняет пользовательский запрос**: провал уходит в
 * `logError` и выполнение продолжается. Обратная сторона — тихая потеря следа;
 * это тот же класс, что CONSENT-WRITE-OBSERVABILITY, и он покрыт тем же
 * пунктом BACKLOG (расширен на обоих writer'ов), а не заведён двойником.
 */

export type PdAccessSurface =
  /** Админ листает пользователей платформы (телефоны + email всех). */
  | "admin.users.list"
  /** Админ листает платежи — платёж несёт идентичность плательщика. */
  | "admin.billing.payments.list"
  /** Админ листает подписки — то же самое. */
  | "admin.billing.subscriptions.list"
  /** Админ выгружает историю событий в Excel (имена с маской фамилии). */
  | "admin.events.export"
  /** Мастер листает свою клиентскую базу (имена + телефоны). */
  | "master.clients.list"
  /** Студия листает свою клиентскую базу. */
  | "studio.clients.list";

type RecordPdAccessInput = {
  surface: PdAccessSurface;
  actorType: PdAccessActorType;
  /** null только для SYSTEM-акторов (cron/worker). */
  actorUserId: string | null;
  /** Какая сущность перечислялась: "UserProfile" / "Booking" / "ClientCard" / … */
  entityType: string;
  /** Сколько строк ушло в ответе. ОДНО событие на ответ, не на строку. */
  rowCount: number;
  /** Результат `buildFilterFingerprint` — форма запроса, не значения. */
  filterFingerprint?: string | null;
  scopeProviderId?: string | null;
  scopeStudioId?: string | null;
  ipAddress?: string | null;
};

/**
 * Форма запроса без единого значения.
 *
 * Принимает карту «имя фильтра → был ли он задан» и отдаёт стабильную
 * строку вида `q+role|limit=50`. По ней при разборе инцидента видно
 * «листали всё подряд» против «искали конкретного человека», и при этом сама
 * строка не является персональными данными — что бы в фильтр ни ввели.
 *
 * Тип параметра — `boolean`, а не `unknown`: передать сюда значение
 * невозможно не потому, что мы его вычистим, а потому что оно не скомпилируется.
 */
export function buildFilterFingerprint(
  filters: Record<string, boolean>,
  extra?: { limit?: number; offset?: number },
): string {
  const active = Object.keys(filters)
    .filter((key) => filters[key])
    .sort()
    .join("+");
  const parts = [active || "none"];
  if (extra?.limit !== undefined) parts.push(`limit=${extra.limit}`);
  if (extra?.offset) parts.push(`offset=${extra.offset}`);
  return parts.join("|");
}

/**
 * Записать факт массового чтения ПДн.
 *
 * Fire-and-forget по семантике отказа, но **await'ится** вызывающим: строка
 * узкая, вставка одна на ответ, и синхронная запись убирает класс «процесс
 * умер, след не долетел». Если это когда-нибудь станет заметно на хвосте
 * латентности — выносить в очередь, но не терять.
 */
export async function recordPdAccess(input: RecordPdAccessInput): Promise<void> {
  // Пустая выборка — не чтение ПДн. Не засоряем след нулями: при разборе
  // инцидента важен объём, а строки с rowCount=0 только разбавляют картину.
  if (input.rowCount <= 0) return;

  try {
    await prisma.pdAccessLog.create({
      data: {
        actorUserId: input.actorUserId,
        actorType: input.actorType,
        surface: input.surface,
        entityType: input.entityType,
        rowCount: input.rowCount,
        filterFingerprint: input.filterFingerprint ?? null,
        scopeProviderId: input.scopeProviderId ?? null,
        scopeStudioId: input.scopeStudioId ?? null,
        requestId: getRequestId() ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (error) {
    // Никогда не роняем пользовательский запрос ради журнала. Но и не молчим:
    // это единственный сигнал о том, что след дырявый.
    logError("Failed to record PD access", {
      surface: input.surface,
      actorType: input.actorType,
      rowCount: input.rowCount,
      error: error instanceof Error ? error.stack : String(error),
    });
    // HARDENING-MISC-01: устойчивый сбой здесь = журнал, заведённый ради
    // 24/72 ч, в нужные дни был дырявым. Это обязано быть алертопригодным.
    reportComplianceWriteFailure(COMPLIANCE_FINGERPRINTS.pdAccessWrite, error, {
      surface: input.surface,
      rowCount: input.rowCount,
    });
  }
}
