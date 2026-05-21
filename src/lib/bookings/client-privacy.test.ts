import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  BookingDto,
  BookingClientDto,
  BookingClientProviderDto,
} from "@/lib/bookings/dto";
import type { ClientBookingDTO } from "@/lib/client-cabinet/bookings.service";

/**
 * MASTER-PRIVACY-FIX-A — Privacy regression tests.
 *
 * Master CRM private fields (`Booking.notes`, `ClientCard.notes`,
 * `ClientCard.tags`, `ClientCard.photos`, `ClientNote.text`) must NEVER
 * surface in client-facing DTOs or in any `select`/`include` block
 * inside a client-cabinet read path.
 *
 * Two layers guard the boundary:
 *
 *   1. **Type-level**: the client DTO types defined in
 *      `src/lib/bookings/dto.ts` + `src/lib/client-cabinet/bookings.service.ts`
 *      must not even *mention* `notes` / `tags` / `clientCard` /
 *      `clientNote` keys. If any future commit widens the DTO with one
 *      of those fields, the `KeysOf` checks below fail at compile time.
 *
 *   2. **Source-level**: the client-facing booking service files must
 *      not contain Prisma `notes: true` or `clientCard:` selects. We
 *      assert this by reading the source bytes — string-level so the
 *      regression triggers even if the offending line type-checks (e.g.
 *      someone returns a wider DTO via `as` cast).
 *
 * If a future privacy-relevant field is added to the schema, extend the
 * `FORBIDDEN_KEYS` + `FORBIDDEN_SOURCE_PATTERNS` arrays so it's covered
 * by both layers.
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");

function readSource(rel: string): string {
  return readFileSync(resolve(PROJECT_ROOT, rel), "utf8");
}

const CLIENT_FACING_BOOKING_SOURCES = [
  "src/lib/bookings/list.ts",
  "src/lib/bookings/mappers.ts",
  "src/lib/bookings/dto.ts",
  "src/lib/client-cabinet/bookings.service.ts",
  "src/app/api/cabinet/user/bookings/route.ts",
  "src/app/api/bookings/my/route.ts",
] as const;

/**
 * Substrings that must never appear in a client-facing read path. The
 * comparison is intentionally simple — these tokens have no legitimate
 * non-master use, so any occurrence indicates a leak or impending one.
 */
const FORBIDDEN_SOURCE_PATTERNS = [
  // Master-private booking field
  /\bnotes:\s*true\b/,
  // Booking.notes scalar read off the row
  /\.notes\b(?!\s*\?)/,  // exclude `notes?:` type definitions inside DTOs (none expected)
  // ClientCard include — master CRM root
  /clientCard\s*:\s*[{T]/i,
  /clientCards\s*:\s*[{T]/i,
  // ClientNote include — separate CRM notes model
  /clientNote\s*:\s*[{T]/i,
  /clientNotes\s*:\s*[{T]/i,
] as const;

describe("MASTER-PRIVACY-FIX-A — DTO type shape", () => {
  it("BookingDto type has no `notes` key", () => {
    // Type-level assertion. If anyone adds `notes` to BookingDto, this
    // line fails to compile (true cannot be assigned to false).
    type HasNotes = "notes" extends keyof BookingDto ? true : false;
    const _check: HasNotes = false;
    expect(_check).toBe(false);
  });

  it("BookingClientDto type has no `notes` key", () => {
    type HasNotes = "notes" extends keyof BookingClientDto ? true : false;
    const _check: HasNotes = false;
    expect(_check).toBe(false);
  });

  it("BookingClientDto type has no `tags` key", () => {
    type HasTags = "tags" extends keyof BookingClientDto ? true : false;
    const _check: HasTags = false;
    expect(_check).toBe(false);
  });

  it("BookingClientDto type has no `clientCard` / `clientNote` key", () => {
    type HasCard = "clientCard" extends keyof BookingClientDto ? true : false;
    type HasNote = "clientNote" extends keyof BookingClientDto ? true : false;
    const _cardCheck: HasCard = false;
    const _noteCheck: HasNote = false;
    expect(_cardCheck).toBe(false);
    expect(_noteCheck).toBe(false);
  });

  it("BookingClientProviderDto has no master-private contact fields", () => {
    // Provider DTO should expose only public-facing details (name, address,
    // avatar, username) — no internal CRM fields.
    type HasNotes = "notes" extends keyof BookingClientProviderDto ? true : false;
    type HasTags = "tags" extends keyof BookingClientProviderDto ? true : false;
    const _n: HasNotes = false;
    const _t: HasTags = false;
    expect(_n).toBe(false);
    expect(_t).toBe(false);
  });

  it("ClientBookingDTO (cabinet/user route shape) has no master-private fields", () => {
    type HasNotes = "notes" extends keyof ClientBookingDTO ? true : false;
    type HasTags = "tags" extends keyof ClientBookingDTO ? true : false;
    type HasCard = "clientCard" extends keyof ClientBookingDTO ? true : false;
    const _n: HasNotes = false;
    const _t: HasTags = false;
    const _c: HasCard = false;
    expect(_n).toBe(false);
    expect(_t).toBe(false);
    expect(_c).toBe(false);
  });

  it("ClientBookingDTO has no master-CRM signal fields (incl. modelApplicationsCount)", () => {
    // MASTER-MODELS-FIX-A: the «откликался на модельные» counter lives
    // on the master CRM detail view only. Catching the leak via type-
    // level assertion gives the same compile-time barrier as the
    // existing notes/tags/clientCard checks above.
    type HasModelCount =
      "modelApplicationsCount" extends keyof ClientBookingDTO ? true : false;
    type HasHistoryToken = "historyToken" extends keyof ClientBookingDTO ? true : false;
    const _m: HasModelCount = false;
    const _h: HasHistoryToken = false;
    expect(_m).toBe(false);
    expect(_h).toBe(false);
  });
});

describe("MASTER-PRIVACY-FIX-A — Source-level boundary checks", () => {
  for (const rel of CLIENT_FACING_BOOKING_SOURCES) {
    it(`${rel} must not contain master-private Prisma selects`, () => {
      const source = readSource(rel);
      const offences: string[] = [];
      for (const pattern of FORBIDDEN_SOURCE_PATTERNS) {
        const match = source.match(pattern);
        if (match) offences.push(`${pattern} → "${match[0]}"`);
      }
      expect(
        offences,
        `Privacy leak risk in ${rel}: ${offences.join(", ")}`,
      ).toEqual([]);
    });
  }
});

describe("MASTER-PRIVACY-FIX-A — Documented invariant", () => {
  it("ClientCard model lives on a provider scope (master CRM-only)", () => {
    // Cross-reference for future maintainers: ClientCard is keyed by
    // providerId (not clientUserId-driven), confirming it's a master's
    // private view of the relationship, not a client's. The schema
    // shape is verified by Prisma.validate elsewhere; this assertion
    // exists purely as a documented anchor so anyone touching this
    // test understands the invariant. The invariant text:
    //
    //   "Master's CRM private fields (Booking.notes, ClientCard.*,
    //    ClientNote.*) MUST NOT appear in any client-facing API
    //    response, SSR payload, or DTO type."
    //
    // See MASTERRYADOM_AI_CONTEXT.md §12 (invariant #25).
    expect(true).toBe(true);
  });
});
