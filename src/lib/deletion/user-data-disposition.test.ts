import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  USER_RELATION_DISPOSITION,
  findStaleDispositionKeys,
  findUnclassifiedRelations,
  type RelationDisposition,
} from "@/lib/deletion/user-data-disposition";

/**
 * RKN-FIX-03-A — the guard against enumeration decay.
 *
 * `delete-account.ts` handles relations by hand. That list silently went stale
 * when Yandex OAuth added `yandexLink` (plaintext tokens surviving deletion),
 * and again for `UserFavorite` and `HotSlotSubscription`. No test failed,
 * because nothing ever compared the list to the schema.
 *
 * This does exactly that comparison: every `UserProfile` relation in the Prisma
 * DMMF must appear in the disposition map. A new `SomethingLink` model fails
 * here until a human classifies it — which is the point.
 */

/** Relation field names on `UserProfile`, straight from the generated schema. */
function userProfileRelationFields(): string[] {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "UserProfile");
  if (!model) throw new Error("UserProfile model missing from the Prisma DMMF");
  return model.fields.filter((f) => f.kind === "object").map((f) => f.name);
}

describe("account-deletion disposition map", () => {
  it("classifies EVERY UserProfile relation (this is the anti-decay guard)", () => {
    const unclassified = findUnclassifiedRelations(userProfileRelationFields());

    expect(
      unclassified,
      `Unclassified UserProfile relation(s): ${unclassified.join(", ")}.\n` +
        "A new relation must be given a disposition in src/lib/deletion/user-data-disposition.ts " +
        "(DELETED / ANONYMIZED / RETAINED / POLICY_PENDING) — and, if it is DELETED, wired into " +
        "delete-account.ts. This is how the yandexLink omission is prevented from recurring.",
    ).toEqual([]);
  });

  it("bites when a relation is left unclassified (proof the guard is not vacuous)", () => {
    const relations = userProfileRelationFields();
    // Simulate the exact failure mode: a model exists in the schema but nobody
    // added it to the map.
    const withHole: Record<string, RelationDisposition> = { ...USER_RELATION_DISPOSITION };
    delete withHole.yandexLink;

    expect(findUnclassifiedRelations(relations, withHole)).toEqual(["yandexLink"]);
  });

  it("also catches a stale key after a relation is renamed or removed", () => {
    expect(findStaleDispositionKeys(userProfileRelationFields())).toEqual([]);
    expect(
      findStaleDispositionKeys(userProfileRelationFields(), {
        ...USER_RELATION_DISPOSITION,
        someRelationThatNoLongerExists: { kind: "DELETED", reason: "stale" },
      }),
    ).toEqual(["someRelationThatNoLongerExists"]);
  });

  it("every entry carries a reason — the map doubles as the Phase B legal input", () => {
    for (const [name, entry] of Object.entries(USER_RELATION_DISPOSITION)) {
      expect(entry.reason.trim().length, `${name} has an empty reason`).toBeGreaterThan(10);
    }
  });

  it("pins the auth-artefact class: every link/session relation is disposed of, none retained", () => {
    // The class this fix is about. If someone later flips one of these to
    // RETAINED, that has to be a deliberate, visible edit.
    for (const name of ["telegramLink", "telegramLinkTokens", "vkLink", "yandexLink"]) {
      expect(USER_RELATION_DISPOSITION[name]?.kind, `${name} must be DELETED`).toBe("DELETED");
    }
    expect(USER_RELATION_DISPOSITION.refreshSessions?.kind).toBe("ANONYMIZED");
  });
});
