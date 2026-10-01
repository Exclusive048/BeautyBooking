import { describe, expect, it } from "vitest";
import { MediaKind, Prisma } from "@prisma/client";

import {
  ACCOUNT_DELETION_POLICY,
  SHADOW_POLICY_RELATIONS,
  deferredCutoff,
  findPolicyDispositionMismatches,
  policyPendingMediaKinds,
  policyPurgedMediaKinds,
  type AccountDeletionPolicy,
} from "@/lib/deletion/account-deletion-policy";
import { USER_RELATION_DISPOSITION } from "@/lib/deletion/user-data-disposition";

/**
 * 29.09 доработки · 26 — сторож «карта диспозиций ↔ политика удаления».
 *
 * Карта (`user-data-disposition.ts`) говорит людям, что удаление делает со
 * связью; политика (`account-deletion-policy.ts`) — коду. Разойдутся — и карта
 * будет обещать юристу «ждёт решения» про связь, которую код уже стирает, или
 * наоборот. Правило: `POLICY_PENDING` ⇔ `KEEP`.
 *
 * @probe 2026-10-01 — каждая проба меняет одну ось:
 *   (1) `bookings: { kind: "ANONYMIZE_NOW" }` при `POLICY_PENDING` в карте —
 *       красный: `bookings: в карте POLICY_PENDING, а политика — ANONYMIZE_NOW`;
 *   (2) `consents` удалена из политики — красный:
 *       `consents: в карте POLICY_PENDING, а в политике связи нет`;
 *   (3) у `notifications` в карте снова `POLICY_PENDING` — красный (политика
 *       уже `DELETE`).
 *   Пробы (1)–(2) закреплены ниже как тесты на фикстурах.
 */

function userProfileRelationFields(): string[] {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "UserProfile");
  if (!model) throw new Error("UserProfile model missing from the Prisma DMMF");
  return model.fields.filter((f) => f.kind === "object").map((f) => f.name);
}

describe("карта диспозиций и политика удаления согласованы", () => {
  it("нет расхождений на настоящих значениях", () => {
    expect(findPolicyDispositionMismatches(ACCOUNT_DELETION_POLICY, USER_RELATION_DISPOSITION)).toEqual([]);
  });

  it("каждая связь политики (кроме теневых) — настоящая связь UserProfile", () => {
    const relations = new Set(userProfileRelationFields());
    const unknown = Object.keys(ACCOUNT_DELETION_POLICY).filter(
      (key) => !SHADOW_POLICY_RELATIONS.includes(key as never) && !relations.has(key),
    );
    expect(unknown).toEqual([]);
    // Теневая — действительно НЕ связь профиля (иначе её стерёг бы DMMF).
    for (const shadow of SHADOW_POLICY_RELATIONS) expect(relations.has(shadow)).toBe(false);
  });

  it("проба: решение принято в политике, а карта говорит «ждёт юриста» — красный", () => {
    const policy = { ...ACCOUNT_DELETION_POLICY, bookings: { kind: "ANONYMIZE_NOW" } as const };
    expect(findPolicyDispositionMismatches(policy, USER_RELATION_DISPOSITION)).toEqual([
      "bookings: в карте POLICY_PENDING, а политика — ANONYMIZE_NOW",
    ]);
  });

  it("проба: связь удалена из политики — красный", () => {
    const policy: Record<string, AccountDeletionPolicy[keyof AccountDeletionPolicy]> = { ...ACCOUNT_DELETION_POLICY };
    delete policy.consents;
    expect(findPolicyDispositionMismatches(policy, USER_RELATION_DISPOSITION)).toEqual([
      "consents: в карте POLICY_PENDING, а в политике связи нет",
    ]);
  });

  it("проба: политика KEEP, а карта уже говорит DELETED — красный", () => {
    const policy = { ...ACCOUNT_DELETION_POLICY, notifications: { kind: "KEEP" } as const };
    expect(findPolicyDispositionMismatches(policy, USER_RELATION_DISPOSITION)).toEqual([
      "notifications: политика KEEP, а карта — DELETED",
    ]);
  });
});

describe("значения политики на 2026-10-01", () => {
  it("решено владельцем — только уведомления (26.2); юридическое — KEEP до ответа", () => {
    expect(ACCOUNT_DELETION_POLICY.notifications).toEqual({ kind: "DELETE" });
    for (const relation of [
      "bookings",
      "modelApplications",
      "chatMessages",
      "consents",
      "reviewsAuthored",
      "clientCards",
      "clientNotes",
    ] as const) {
      expect(ACCOUNT_DELETION_POLICY[relation], relation).toEqual({ kind: "KEEP" });
    }
  });

  it("допустимые действия заданы типом: недопустимое не компилируется", () => {
    const policy: AccountDeletionPolicy = {
      ...ACCOUNT_DELETION_POLICY,
      // @ts-expect-error — историю записей не удаляют, только анонимизируют.
      bookings: { kind: "DELETE" },
    };
    const consents: AccountDeletionPolicy["consents"] = {
      // @ts-expect-error — согласие либо хранят, либо удаляют по сроку.
      kind: "ANONYMIZE_NOW",
    };
    expect(policy && consents).toBeTruthy();
  });
});

describe("медиа следует за политикой связи", () => {
  it("сейчас все четыре вида ждут решения, ни один не удаляется", () => {
    expect(policyPurgedMediaKinds()).toEqual([]);
    expect(policyPendingMediaKinds().sort()).toEqual(
      [
        MediaKind.BOOKING_REFERENCE,
        MediaKind.CHAT_ATTACHMENT,
        MediaKind.CLIENT_CARD_PHOTO,
        MediaKind.MODEL_APPLICATION_PHOTO,
      ].sort(),
    );
  });

  it("решение по связи переносит её вид из ждущих в удаляемые", () => {
    const policy: AccountDeletionPolicy = {
      ...ACCOUNT_DELETION_POLICY,
      clientCards: { kind: "DELETE" },
      bookings: { kind: "ANONYMIZE_AFTER", months: 36 },
    };
    expect(policyPurgedMediaKinds(policy).sort()).toEqual(
      [MediaKind.BOOKING_REFERENCE, MediaKind.CLIENT_CARD_PHOTO].sort(),
    );
    expect(policyPendingMediaKinds(policy).sort()).toEqual(
      [MediaKind.CHAT_ATTACHMENT, MediaKind.MODEL_APPLICATION_PHOTO].sort(),
    );
  });
});

describe("срок отложенного действия", () => {
  it("календарные месяцы в UTC", () => {
    expect(deferredCutoff(new Date("2026-10-01T12:00:00Z"), 36).toISOString()).toBe("2023-10-01T12:00:00.000Z");
    expect(deferredCutoff(new Date("2026-01-15T08:30:00Z"), 13).toISOString()).toBe("2024-12-15T08:30:00.000Z");
  });

  it("конец месяца зажимается, а не переполняется в следующий", () => {
    expect(deferredCutoff(new Date("2026-03-31T00:00:00Z"), 1).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(deferredCutoff(new Date("2028-03-31T00:00:00Z"), 1).toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });
});
