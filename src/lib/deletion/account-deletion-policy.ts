import { MediaKind } from "@prisma/client";

/**
 * 29.09 доработки · 26 (RKN-FIX-03-B) — что удаление аккаунта делает с данными,
 * судьбу которых решает юрист или владелец. Политика — ОДНА константа ниже;
 * функции всех действий написаны заранее (`account-deletion-actions.ts`) и
 * покрыты тестами, поэтому включить решение — значит поменять значение здесь.
 *
 * 🔴 **По умолчанию — `KEEP`, то есть как сейчас.** Анонимизация и удаление
 * необратимы: включать их можно только по ПИСЬМЕННОМУ ответу юриста и со снимком
 * БД на проде. Вопросы — `docs/audits/29.09 доработки/26-account-deletion-policy.md`
 * (Ю26.1–Ю26.5); у каждой связи ниже названо, какой ответ что включает.
 *
 * Связи политики — те, что в карте `user-data-disposition.ts` стоят
 * `POLICY_PENDING`, плюс решённые владельцем, плюс «теневые» (не связи
 * `UserProfile`, а данные о человеке по другим путям — переписка). Сторож
 * `account-deletion-policy.test.ts` держит карту и политику согласованными: у
 * связи `POLICY_PENDING` политика обязана быть `KEEP`, у решённой — нет.
 */

export type Keep = { kind: "KEEP" };
export type Delete = { kind: "DELETE" };
/** Строки остаются (история мастера), но ПДн клиента из них вычищаются сразу. */
export type AnonymizeNow = { kind: "ANONYMIZE_NOW" };
/** То же через `months` месяцев после удаления — проход воркера раз в сутки. */
export type AnonymizeAfter = { kind: "ANONYMIZE_AFTER"; months: number };
/** Строки удаляются через `months` месяцев после удаления аккаунта. */
export type DeleteAfter = { kind: "DELETE_AFTER"; months: number };
/** Хранятся, но в окне удаления человек может удалить их сам (галочка). */
export type UserChoice = { kind: "USER_CHOICE" };

export type DeletionAction = Keep | Delete | AnonymizeNow | AnonymizeAfter | DeleteAfter | UserChoice;

/**
 * Какие действия допустимы для какой связи — ТИПОМ. Удалить историю записей
 * целиком (`DELETE` у `bookings`) или «анонимизировать» согласие нельзя
 * по смыслу, и такая правка не компилируется.
 */
export type AccountDeletionPolicy = {
  /** Ю26.1: А — `ANONYMIZE_NOW`; Б — `ANONYMIZE_AFTER` 36; В — `KEEP`. */
  bookings: Keep | AnonymizeNow | AnonymizeAfter;
  /** Следует за Ю26.1: без брони — удаляется, с бронью — без заметки и фото. */
  modelApplications: Keep | AnonymizeNow;
  /** Ю26.5: текст сообщений клиента → «Сообщение удалено», вложения удаляются. */
  chatMessages: Keep | AnonymizeNow;
  /** Ю26.2: рекомендация — `DELETE_AFTER` 36 (3 года целиком, затем удалить). */
  consents: Keep | DeleteAfter;
  /** Ю26.3: А — `KEEP`; Б — `USER_CHOICE` (рекомендация); В — `DELETE`. */
  reviewsAuthored: Keep | UserChoice | Delete;
  /** Ю26.4: рекомендация — `DELETE` (в заметках возможны сведения о здоровье). */
  clientCards: Keep | Delete;
  /** Ю26.4 — вместе с карточками. */
  clientNotes: Keep | Delete;
  /** Решение владельца 26.2 (01.10): удалять все сразу. */
  notifications: Keep | Delete;
};

const KEEP: Keep = { kind: "KEEP" };

export const ACCOUNT_DELETION_POLICY: AccountDeletionPolicy = {
  bookings: KEEP,
  modelApplications: KEEP,
  chatMessages: KEEP,
  consents: KEEP,
  reviewsAuthored: KEEP,
  clientCards: KEEP,
  clientNotes: KEEP,
  notifications: { kind: "DELETE" },
};

export type PolicyRelation = keyof AccountDeletionPolicy;

/**
 * Связи политики, которых НЕТ среди связей `UserProfile` (DMMF их не видит):
 * сообщения клиента висят на `BookingChat` → `Booking`, а не на профиле.
 */
export const SHADOW_POLICY_RELATIONS: readonly PolicyRelation[] = ["chatMessages"];

/**
 * Чьё медиа удаляется вместе со связью. Пока у связи `KEEP`, её вид остаётся в
 * `POLICY_PENDING_KINDS` (`media/purge.ts`) и не трогается.
 */
export const MEDIA_KIND_POLICY_RELATION = {
  [MediaKind.CLIENT_CARD_PHOTO]: "clientCards",
  [MediaKind.MODEL_APPLICATION_PHOTO]: "modelApplications",
  [MediaKind.BOOKING_REFERENCE]: "bookings",
  [MediaKind.CHAT_ATTACHMENT]: "chatMessages",
} as const satisfies Partial<Record<MediaKind, PolicyRelation>>;

export type PolicyMediaKind = keyof typeof MEDIA_KIND_POLICY_RELATION;

/** Действует ли решение (что угодно, кроме «как сейчас»). */
export function isPolicyActive(action: DeletionAction): boolean {
  return action.kind !== "KEEP";
}

/** Действие выполняется в момент удаления аккаунта, а не отложенным проходом. */
export function actsAtDeletion(action: DeletionAction): boolean {
  return action.kind === "DELETE" || action.kind === "ANONYMIZE_NOW";
}

/** Срок отложенного действия в месяцах либо `null`. */
export function deferredMonths(action: DeletionAction): number | null {
  return action.kind === "ANONYMIZE_AFTER" || action.kind === "DELETE_AFTER" ? action.months : null;
}

/** Виды медиа, которые удаление аккаунта сейчас имеет право стирать по политике. */
export function policyPurgedMediaKinds(policy: AccountDeletionPolicy = ACCOUNT_DELETION_POLICY): PolicyMediaKind[] {
  return (Object.keys(MEDIA_KIND_POLICY_RELATION) as PolicyMediaKind[]).filter((kind) =>
    isPolicyActive(policy[MEDIA_KIND_POLICY_RELATION[kind]]),
  );
}

/** Виды медиа, чья связь ещё ждёт решения (`KEEP`). */
export function policyPendingMediaKinds(policy: AccountDeletionPolicy = ACCOUNT_DELETION_POLICY): PolicyMediaKind[] {
  return (Object.keys(MEDIA_KIND_POLICY_RELATION) as PolicyMediaKind[]).filter(
    (kind) => !isPolicyActive(policy[MEDIA_KIND_POLICY_RELATION[kind]]),
  );
}

/**
 * Месяцы → граница «удалён раньше, чем». Календарные месяцы, UTC (UTC-tech):
 * срок хранения считается от `UserProfile.deletedAt`, а не от часов зрителя.
 */
export function deferredCutoff(now: Date, months: number): Date {
  // День зажимается к концу целевого месяца: голый `setUTCMonth` переполняется
  // (31 марта − 1 месяц = «31 февраля» = 3 марта) и укорачивает срок хранения.
  const monthIndex = now.getUTCFullYear() * 12 + now.getUTCMonth() - months;
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex - year * 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(now.getUTCDate(), lastDay),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  );
}

type DispositionKind = "DELETED" | "ANONYMIZED" | "RETAINED" | "POLICY_PENDING";

/**
 * Расхождения карты диспозиций и политики (чистая функция — сторож кормит её
 * и настоящими значениями, и намеренно сломанными):
 *  - связь политики (не теневая) отсутствует в карте;
 *  - в карте `POLICY_PENDING`, а политика уже что-то делает — решение принято,
 *    а карта говорит «ждёт юриста»;
 *  - политика `KEEP`, а карта говорит, что связь удаляется/анонимизируется;
 *  - в карте `POLICY_PENDING`, а в политике связи нет вовсе.
 */
export function findPolicyDispositionMismatches(
  policy: Record<string, DeletionAction>,
  disposition: Record<string, { kind: DispositionKind }>,
  shadow: readonly string[] = SHADOW_POLICY_RELATIONS,
): string[] {
  const problems: string[] = [];
  for (const [relation, action] of Object.entries(policy)) {
    if (shadow.includes(relation)) continue;
    const entry = disposition[relation];
    if (!entry) {
      problems.push(`${relation}: есть в политике, нет в карте диспозиций`);
      continue;
    }
    if (entry.kind === "POLICY_PENDING" && isPolicyActive(action)) {
      problems.push(`${relation}: в карте POLICY_PENDING, а политика — ${action.kind}`);
    }
    if (!isPolicyActive(action) && (entry.kind === "DELETED" || entry.kind === "ANONYMIZED")) {
      problems.push(`${relation}: политика KEEP, а карта — ${entry.kind}`);
    }
  }
  for (const [relation, entry] of Object.entries(disposition)) {
    if (entry.kind === "POLICY_PENDING" && !(relation in policy)) {
      problems.push(`${relation}: в карте POLICY_PENDING, а в политике связи нет`);
    }
  }
  return problems;
}
