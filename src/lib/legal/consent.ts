import "server-only";

import { AccountType, ConsentType } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { logError, logInfo } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { LEGAL_DOCUMENTS, type LegalDocumentKey } from "@/lib/legal/documents";
import { hasRequiredConsents, type ConsentFlags } from "@/lib/legal/consent-flags";

/**
 * RKN-FIX-01 — the single writer of `UserConsent`.
 *
 * Every registration path (phone OTP, email OTP, VK, Yandex, Telegram) records
 * through here, so the stored proof has the same shape everywhere: which
 * purpose, which document version, when, from which IP/UA.
 *
 * Mapping decision (documented in the report): the PD-processing consent gets
 * its OWN `ConsentType.PD_PROCESSING` rather than reusing `PRIVACY`. Reusing
 * `PRIVACY` would leave the data ambiguous — the privacy policy is an
 * informational disclosure (уведомление), the PD consent is a separate legal
 * act against a separate document, and a lawyer reading the table must be able
 * to tell which one a row proves. `PRIVACY` is consequently no longer written.
 */

const CONSENT_DOCUMENT: Partial<Record<ConsentType, LegalDocumentKey>> = {
  [ConsentType.TERMS]: "TERMS",
  [ConsentType.PD_PROCESSING]: "PD_CONSENT",
  [ConsentType.MARKETING]: "MARKETING",
};

/** Version string stamped on a `UserConsent` row of this type. */
export function consentDocumentVersion(consentType: ConsentType): string {
  const key = CONSENT_DOCUMENT[consentType];
  if (!key) {
    throw new Error(`No legal document is mapped to ConsentType.${consentType}`);
  }
  return LEGAL_DOCUMENTS[key].version;
}

/** Which consent rows a set of ticked boxes maps to. Unticked → no row at all. */
export function consentTypesFromFlags(flags: ConsentFlags): ConsentType[] {
  const types: ConsentType[] = [];
  if (flags.terms) types.push(ConsentType.TERMS);
  if (flags.pdProcessing) types.push(ConsentType.PD_PROCESSING);
  // An unticked marketing box records NOTHING — absence of consent, not a
  // "declined" row. Withdrawing an existing marketing consent is a deliberate
  // act with its own UI (RKN-FIX-18), never a side effect of a login form.
  if (flags.marketing) types.push(ConsentType.MARKETING);
  return types;
}

/**
 * Server-side enforcement of the required consents. UI gating is not enough:
 * the boxes are the user's affirmative act, and the route that CREATES the
 * account is what has to refuse without them.
 */
export function assertRequiredConsents(flags: ConsentFlags | null | undefined): asserts flags is ConsentFlags {
  if (!hasRequiredConsents(flags)) {
    throw new AppError(
      "Consent to the user agreement and to personal-data processing is required",
      400,
      "CONSENT_REQUIRED",
    );
  }
}

type RecordConsentsInput = {
  userId: string;
  flags: ConsentFlags;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Write the consent rows for the ticked boxes — idempotently.
 *
 * Repeat logins do NOT spam rows: an ACTIVE row for the current version means
 * there is nothing to write. Two things still produce a write:
 *   • a version bump — a NEW row for the new version, leaving the older proof
 *     intact (that history is the point: it shows what each version was agreed
 *     to and when);
 *   • re-consent after a withdrawal — a **brand-new row**, see below.
 *
 * 🔴 RKN-FIX-18 — СТРОКИ НЕ ОЖИВЛЯЮТСЯ. Раньше повторное согласие делало
 * `revokedAt = null` + свежий `agreedAt` на отозванной строке. Это стирало
 * ровно то, что и требуется доказывать: исходную дату согласия и сам факт
 * отзыва. Теперь отозванная строка неприкосновенна, а повторное согласие
 * вставляет новую — таймлайн «согласился → отозвал → согласился снова»
 * восстановим целиком.
 *
 * Отсюда и `isActive` ниже: наличие ОТОЗВАННОЙ строки не считается
 * «согласие уже есть» и не мешает записать новое. На уровне БД «не более
 * одной активной» держит partial unique `UserConsent_active_unique_idx`.
 *
 * Never throws into the caller's flow: a consent write failing must not strand
 * a user mid-login, so it is logged and swallowed (the login-blocking check is
 * `assertRequiredConsents`, which runs BEFORE the account is created).
 */
export async function recordUserConsents(input: RecordConsentsInput): Promise<void> {
  const types = consentTypesFromFlags(input.flags);
  if (types.length === 0) return;

  const wanted = types.map((consentType) => ({
    consentType,
    documentVersion: consentDocumentVersion(consentType),
  }));

  try {
    const existing = await prisma.userConsent.findMany({
      where: { userId: input.userId, OR: wanted },
      select: { id: true, consentType: true, documentVersion: true, revokedAt: true },
    });

    // RKN-FIX-18: «уже есть» = есть АКТИВНАЯ строка. Отозванная — это история,
    // она не блокирует новое согласие (и partial unique её тоже не блокирует).
    const isActive = (want: (typeof wanted)[number]) =>
      existing.some(
        (row) =>
          row.consentType === want.consentType &&
          row.documentVersion === want.documentVersion &&
          row.revokedAt === null,
      );

    const toCreate = wanted.filter((want) => !isActive(want));
    if (toCreate.length > 0) {
      await prisma.userConsent.createMany({
        data: toCreate.map((want) => ({
          userId: input.userId,
          consentType: want.consentType,
          documentVersion: want.documentVersion,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
        })),
        // Two logins racing on a first-ever consent: the loser skips instead of
        // failing the login on a P2002.
        skipDuplicates: true,
      });
    }
  } catch (error) {
    logError("Failed to record user consents", {
      userId: input.userId,
      error: error instanceof Error ? error.stack : String(error),
    });
  }
}

/**
 * RKN-FIX-02 — may an UNAUTHENTICATED actor cause consent rows on this profile?
 *
 * Guest checkout resolves the client by phone, and `findOrCreateGuestUserByPhone`
 * happily returns an EXISTING profile when that phone is already known — which
 * may be a real, registered person. Writing consent rows in that branch would
 * manufacture legal proof the account owner never gave, from a request they
 * never made. That is worse than having no proof at all.
 *
 * So rows are written only for a profile that has never been an account:
 *   • no `RefreshSession` row ever (logout REVOKES rather than deletes, so this
 *     stays true forever once someone has logged in — a reliable "was an
 *     account" marker, not a "currently signed in" one);
 *   • no email / verified email, no Telegram / VK / Yandex link — every one of
 *     those can only come from an authenticated flow;
 *   • roles are exactly `[CLIENT]` — a MASTER/STUDIO/ADMIN profile is by
 *     definition established.
 *
 * A freshly created guest profile (`wasCreated`) trivially satisfies all of it
 * and skips the query.
 */
export async function isGuestClassProfile(userId: string): Promise<boolean> {
  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: {
      roles: true,
      email: true,
      emailVerifiedAt: true,
      telegramId: true,
      vkLink: { select: { id: true } },
      yandexLink: { select: { id: true } },
      _count: { select: { refreshSessions: true } },
    },
  });
  if (!profile) return false;

  return (
    profile._count.refreshSessions === 0 &&
    !profile.email &&
    !profile.emailVerifiedAt &&
    !profile.telegramId &&
    !profile.vkLink &&
    !profile.yandexLink &&
    profile.roles.length === 1 &&
    profile.roles[0] === AccountType.CLIENT
  );
}

/**
 * Consent recorded from a guest (unauthenticated) checkout, against the profile
 * the booking is attributed to. Same writer, same versions, same idempotency —
 * plus the "never forge proof on someone else's account" guard above.
 */
export async function recordGuestConsents(input: {
  userId: string;
  /** True when the guest path just created this profile — no lookup needed. */
  wasCreated: boolean;
  flags: ConsentFlags;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  if (!input.wasCreated) {
    let writable = false;
    try {
      writable = await isGuestClassProfile(input.userId);
    } catch (error) {
      // Can't establish WHOSE profile this is → don't write. Mirrors
      // `recordUserConsents`: consent bookkeeping never takes the caller's
      // flow down with it, but the gap is loud in the logs.
      logError("Guest consent skipped — profile class could not be resolved", {
        userId: input.userId,
        error: error instanceof Error ? error.stack : String(error),
      });
      return;
    }

    if (!writable) {
      // Not an error: the booking still goes through. The person whose phone
      // this is consented when they registered; an anonymous booker cannot
      // re-consent on their behalf.
      logInfo("Guest consent not recorded — phone belongs to an established account", {
        userId: input.userId,
      });
      return;
    }
  }

  await recordUserConsents({
    userId: input.userId,
    flags: input.flags,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
}

/* ------------------------------------------------------------------------- *
 * RKN-FIX-18 — отзыв согласия
 * ------------------------------------------------------------------------- */

/**
 * Цели, которые пользователь может отозвать САМ, из интерфейса.
 *
 * Здесь ровно одна — `MARKETING`. Это не недоделка, а граница: отзыв согласия
 * на обработку ПДн или на оферту — функционально не «выключить рассылку», а
 * требование прекратить обработку, то есть запрос на удаление аккаунта. Дать
 * ему вид тумблера значило бы пообещать пользователю то, чего тумблер не
 * делает: брони, платежи и переписка никуда не денутся, а обязанность их
 * хранить останется. Поэтому UI такое намерение **маршрутизирует** — в
 * удаление аккаунта и в поддержку, — а не исполняет.
 *
 * Расширять этот набор можно только вместе с решением юриста (RKN-FIX-03-B).
 */
const SELF_REVOCABLE: ReadonlySet<ConsentType> = new Set([ConsentType.MARKETING]);

export function isSelfRevocable(consentType: ConsentType): boolean {
  return SELF_REVOCABLE.has(consentType);
}

/**
 * Активные (не отозванные) согласия пользователя по цели — сырьё для UI.
 * Версий может быть несколько, если документ бампался: активной остаётся та,
 * на которую пользователь соглашался последней.
 */
export async function getActiveConsent(
  userId: string,
  consentType: ConsentType,
): Promise<{ documentVersion: string; agreedAt: Date } | null> {
  const row = await prisma.userConsent.findFirst({
    where: { userId, consentType, revokedAt: null },
    orderBy: { agreedAt: "desc" },
    select: { documentVersion: true, agreedAt: true },
  });
  return row;
}

/**
 * Отозвать согласие. **Строка не удаляется и не мутируется обратно в живую** —
 * проставляется `revokedAt`, и она остаётся в журнале как часть доказательной
 * истории (см. заголовок `recordUserConsents`).
 *
 * Отзываются ВСЕ активные строки этой цели: пользователь отзывает цель, а не
 * конкретную версию документа. Если версий было несколько (документ бампался),
 * активной могла остаться не одна.
 *
 * Идемпотентно: повторный отзыв не находит активных строк и ничего не пишет.
 * Возвращает число отозванных строк — вызывающий может отличить «отозвали» от
 * «уже было отозвано».
 *
 * В отличие от `recordUserConsents`, ЭТОТ путь **бросает** при недопустимой
 * цели: отзыв — явное действие пользователя, и молча проглотить отказ значило
 * бы показать ему «выключено», когда ничего не выключено.
 */
export async function revokeConsent(input: {
  userId: string;
  consentType: ConsentType;
}): Promise<number> {
  if (!isSelfRevocable(input.consentType)) {
    throw new AppError(
      "Эта цель обработки не отзывается через настройки",
      400,
      "CONSENT_NOT_SELF_REVOCABLE",
    );
  }

  const result = await prisma.userConsent.updateMany({
    where: { userId: input.userId, consentType: input.consentType, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (result.count > 0) {
    logInfo("User consent revoked", {
      userId: input.userId,
      consentType: input.consentType,
      rows: result.count,
    });
  }
  return result.count;
}
