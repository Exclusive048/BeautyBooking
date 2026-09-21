/**
 * RKN-FIX-03-A — what happens to every piece of a user's data on account
 * deletion, declared once and enforced by a test.
 *
 * Why this file exists: `delete-account.ts` handles relations by hand, and the
 * hand-written list went stale the moment Yandex OAuth landed — `yandexLink`
 * (with its plaintext access/refresh tokens) simply never made it in. Nothing
 * failed; the omission was invisible. The same decay had also quietly swallowed
 * `UserFavorite`, `HotSlotSubscription` and the studio membership rows of an
 * admin without a master cabinet.
 *
 * The map below closes the class: `user-data-disposition.test.ts` walks the
 * Prisma DMMF for every `UserProfile` relation and fails if one is missing
 * here. A future `SomethingLink` model therefore breaks the build until a human
 * decides what deletion does with it.
 *
 * NOTE on semantics: account deletion is **anonymisation**, not a row delete —
 * the `UserProfile` row survives with its identifying fields nulled. So no
 * `onDelete: Cascade` ever fires, and everything not listed as DELETED here
 * genuinely stays in the database. That is exactly why this table has to be
 * explicit.
 *
 * The `RETAINED` / `POLICY_PENDING` entries are the input artefact for the
 * Phase B legal review (`RKN-FIX-03-B`): they are the questions a lawyer has to
 * answer, with the engineering facts already attached.
 */

export type DispositionKind =
  /** Rows are removed on account deletion. */
  | "DELETED"
  /** Rows survive, but the identifying fields are cleared. */
  | "ANONYMIZED"
  /** Rows survive deliberately — reason states the justification. */
  | "RETAINED"
  /** Survives today; what SHOULD happen is a legal decision (Phase B). */
  | "POLICY_PENDING";

export type RelationDisposition = {
  kind: DispositionKind;
  /** Where it happens (or why it doesn't). Read by humans, not by code. */
  reason: string;
};

/**
 * Keyed by the relation FIELD name on `UserProfile` (Prisma DMMF field names),
 * not by the target model — two relations can point at the same model with
 * opposite dispositions (`reviewsAuthored` vs `reviewsDeleted`).
 */
export const USER_RELATION_DISPOSITION: Record<string, RelationDisposition> = {
  // ── Auth artefacts and tokens: nothing here has a retention justification ──
  telegramLink: { kind: "DELETED", reason: "delete-account: OAuth-adjacent link + tokens" },
  telegramLinkTokens: { kind: "DELETED", reason: "delete-account: single-use linking tokens" },
  vkLink: {
    kind: "DELETED",
    reason:
      "delete-account: VK id + device binding. RKN-FIX-12 removed the access/refresh " +
      "token columns entirely (write-only in practice), so this row no longer carries " +
      "a third-party credential — only the link identity",
  },
  yandexLink: {
    kind: "DELETED",
    reason:
      "delete-account: Yandex id. RKN-FIX-03-A closed this gap — it was the only link " +
      "left behind when Yandex OAuth was added; RKN-FIX-12 then dropped its token " +
      "columns (zero read sites), shrinking what deletion has to reach",
  },
  refreshSessions: {
    kind: "ANONYMIZED",
    reason:
      "delete-account: every session is REVOKED (revokedAt set), not deleted. Revoking " +
      "terminates access explicitly; the rows carry no PD (no IP/UA/device) and keeping " +
      "them preserves the 'this profile was once an account' marker that " +
      "`isGuestClassProfile` (RKN-FIX-02) depends on",
  },

  // ── User-owned preferences: no reason to outlive the account ──────────────
  pushSubscriptions: { kind: "DELETED", reason: "delete-account: device push endpoints" },
  favorites: { kind: "DELETED", reason: "delete-account: portfolio bookmarks" },
  providerFavorites: {
    kind: "DELETED",
    reason: "delete-account: catalog hearts (RKN-FIX-03-A — `favorites` was cleaned, this newer twin was not)",
  },
  hotSlotSubscriptions: {
    kind: "DELETED",
    reason:
      "delete-account: hot-slot subscriptions (RKN-FIX-03-A). Left behind they kept " +
      "`notifyHotSlotSubscribers` writing Notification rows to a deleted account forever",
  },
  publicUsernameAliases: { kind: "DELETED", reason: "delete-account: released public handles" },

  // ── Cabinets / memberships ────────────────────────────────────────────────
  masterProfile: { kind: "DELETED", reason: "delete-master (cabinet deletion runs first)" },
  ownedStudios: { kind: "DELETED", reason: "delete-studio: the Studio row is deleted" },
  providers: {
    kind: "ANONYMIZED",
    reason:
      "delete-master / delete-studio: unpublished and stripped (avatar, contacts, address, " +
      "geo, public handle). The Provider row anchors historical bookings, so it stays",
  },
  studioMemberships: {
    kind: "DELETED",
    reason:
      "delete-account (RKN-FIX-03-A) + delete-master. Previously only the master path " +
      "cleaned these, so a studio ADMIN without a master cabinet stayed an ACTIVE member " +
      "of a live studio after deleting their account",
  },
  studioMembers: {
    kind: "DELETED",
    reason: "delete-account (RKN-FIX-03-A) + delete-master — legacy twin of studioMemberships",
  },
  studioInvites: {
    kind: "RETAINED",
    reason:
      "Invites this user SENT belong to the studio's workflow and carry the invitee's " +
      "phone, not this user's. Deleted with the studio (delete-studio)",
  },

  // ── Financial / compliance: retention is the justification ────────────────
  subscriptions: {
    kind: "RETAINED",
    reason:
      "delete-account deletes payment-less subscriptions; ones with BillingPayment rows are " +
      "kept as accounting evidence",
  },
  adminAuditLogs: {
    kind: "RETAINED",
    reason: "инв. #16 — admin action history is compliance evidence (onDelete: Restrict)",
  },
  pdAccessLogs: {
    kind: "ANONYMIZED",
    reason:
      "RKN-FIX-10 — след массовых чтений ПДн. `onDelete: SetNull` (НЕ Restrict, как у " +
      "adminAuditLogs): удаление аккаунта не должно блокироваться тем, что человек " +
      "когда-то открывал список своих клиентов, но и стирать след нельзя — это " +
      "доказательная база для scoping инцидента (152-ФЗ ст. 21 ч. 3.1, 24/72 ч). " +
      "Обнуляется `actorUserId`; строка живёт дальше с actorType/surface/rowCount/IP. " +
      "⚠️ POLICY-вход для RKN-FIX-04: в осиротевшей строке остаётся IP удалённого " +
      "пользователя — у этой таблицы ОБЯЗАН быть конечный срок хранения, иначе " +
      "«право на забвение» протекает через журнал, который его же и защищает",
  },
  reviewsDeleted: {
    kind: "RETAINED",
    reason: "Moderation trail: which admin soft-deleted which review (инв. #17)",
  },
  blockedBy: { kind: "RETAINED", reason: "Admin block metadata — moderation evidence" },
  blockedUsers: { kind: "RETAINED", reason: "Blocks this user issued as admin — moderation evidence" },
  createdCategories: {
    kind: "RETAINED",
    reason: "Platform taxonomy (GlobalCategory): no PD, owned by the catalog rather than the author",
  },

  // ── Phase B: needs a legal decision, NOT an engineering one ───────────────
  bookings: {
    kind: "POLICY_PENDING",
    reason:
      "RKN-FIX-03-B: `clientName`/`clientPhone` (+ snapshots) survive, so a deleted user is " +
      "still findable by phone in booking history. Counsel decides retention vs anonymisation",
  },
  bookingPackages: {
    kind: "POLICY_PENDING",
    reason: "RKN-FIX-03-B: groups the bookings above; follows whatever they get",
  },
  notifications: {
    kind: "POLICY_PENDING",
    reason:
      "RKN-FIX-03-B: only rows older than 30 days are deleted; fresher ones keep names and " +
      "appointment times. No background retention job exists (RKN-FIX-04)",
  },
  consents: {
    kind: "POLICY_PENDING",
    reason:
      "RKN-FIX-03-B: UserConsent holds IP + User-Agent. It is also the proof that processing " +
      "was lawful, so how long it outlives the account is a legal question",
  },
  reviewsAuthored: {
    kind: "POLICY_PENDING",
    reason:
      "RKN-FIX-03-B: public UGC. Retained on every path — DELETION-03 removed the old " +
      "asymmetry where delete-master hard-deleted the reviews its owner wrote AS A CLIENT " +
      "(without recalculating those providers' ratings). The author renders as " +
      "«Удалённый пользователь»; review TEXT may still contain PD — counsel decides",
  },
  clientCards: {
    kind: "POLICY_PENDING",
    reason:
      "RKN-FIX-03-B: CRM cards masters keep ABOUT this client (phone, notes, photos) — the " +
      "master is a separate controller (инв. #25)",
  },
  clientNotes: {
    kind: "POLICY_PENDING",
    reason: "RKN-FIX-03-B: master's free-text notes about this client — same controller question",
  },
  modelApplications: {
    kind: "POLICY_PENDING",
    reason:
      "RKN-FIX-03-B: applications to model offers carry the user's own free-text note and a " +
      "booking link — business correspondence, same family as bookings",
  },
  mediaAssetsCreated: {
    kind: "DELETED",
    reason:
      "DELETION-02 (MEDIA-PURGE-ON-DELETE) — реализовано: снимок ключей делается ДО " +
      "транзакции, после коммита ставится задача `media.purge`, воркер удаляет объект в " +
      "хранилище и только затем строку. Покрываются AVATAR (entityType USER) и " +
      "AVATAR/PORTFOLIO кабинета. ⚠️ ЧАСТИЧНО: CLIENT_CARD_PHOTO, MODEL_APPLICATION_PHOTO, " +
      "BOOKING_REFERENCE и CHAT_ATTACHMENT намеренно НЕ удаляются — они едут за своими " +
      "POLICY_PENDING-связями (clientCards/clientNotes, modelApplications, bookings), и " +
      "решить за юриста здесь было бы подменой RKN-FIX-03-B. Механизм для них уже есть: " +
      "фазе B остаётся классифицировать и позвать, а не строить",
  },
};

/**
 * Relation field names present on `UserProfile` but absent from the map.
 * Pure so the test can prove the guard bites (feed it a map with a hole).
 */
export function findUnclassifiedRelations(
  relationFieldNames: readonly string[],
  disposition: Record<string, RelationDisposition> = USER_RELATION_DISPOSITION,
): string[] {
  return relationFieldNames.filter((name) => !(name in disposition));
}

/** Map keys that no longer exist on `UserProfile` — catches renames/removals. */
export function findStaleDispositionKeys(
  relationFieldNames: readonly string[],
  disposition: Record<string, RelationDisposition> = USER_RELATION_DISPOSITION,
): string[] {
  const known = new Set(relationFieldNames);
  return Object.keys(disposition).filter((name) => !known.has(name));
}
