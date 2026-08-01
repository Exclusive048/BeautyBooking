// QA-02 — Client booking data-integrity anchors (API level).
//
// The booking *UI* funnel (/u/[username] profile + /u/[username]/booking +
// the public slots API) is currently 🔴 down — the schedule slot-engine module
// graph crashes the Next render worker (see QA-FINDINGS §4, QA-101). So these
// anchors are exercised against POST /api/bookings directly, which compiles and
// runs fine (it does not import the crashing `listAvailabilitySlotsPaginated`).
//
// What this guards (all currently PASS):
//   - valid future booking succeeds (201, PENDING since autoConfirm=false)
//   - double-booking the same slot is rejected (SLOT_CONFLICT, no duplicate row)
//   - partial overlap is rejected (SLOT_CONFLICT)
//   - minBookingHoursAhead enforced (BOOKING_TOO_SOON)  [BACKLOG said "not
//     enforced" — the create path DOES enforce it]
//   - maxBookingDaysAhead enforced (BOOKING_TOO_FAR)
//
// Subject: Галина Степанова (galina-stepanova-26), Europe/Moscow, Mon–Sat
// 10:00–19:00, minBookingHoursAhead=2, maxBookingDaysAhead=90, autoConfirm=false.
// These ids are seed-stable; if the seed is reset they must be re-resolved.
//
// NOTE: each run creates real PENDING bookings in the dev DB (there is no
// public delete endpoint). Runs use a unique far-future day so re-runs don't
// self-collide; reset with `npm run seed:test:reset && npm run seed:test` if the
// horizon ever overflows maxBookingDaysAhead.

import { expect, test, type APIRequestContext } from "@playwright/test";

const PROVIDER_ID = "cmprgothd00nfvlakwtca3rct"; // Галина Степанова (provider)
const SERVICE_ID = "cmprgothr00nlvlakdeeky7bn"; // "Стрижка мужская", 45 min
const HEADERS = { "Content-Type": "application/json", Origin: "http://localhost:3000" };

// Slots ~30 days out, inside Galina's hours (Mon–Sat 10:00–19:00 MSK) and the
// 2h..90d window. `dayIndex` (0,1,2 → Mon/Tue/Wed) isolates tests *within* a run
// onto different days; a per-run hour offset (run start-second) keeps *re-runs*
// from colliding. 2026-07-06 is a Monday; dayIndex stays ≤2 to avoid Sunday.
function uniqueSlot(dayIndex: number): { startAtUtc: string; endAtUtc: string; label: string } {
  const monday = Date.parse("2026-07-06T00:00:00.000Z");
  const offsetHours = new Date().getUTCSeconds() % 6; // 0..5 → 09:00..14:00Z (12:00..17:00 MSK)
  const start = new Date(monday + dayIndex * 86_400_000 + (9 + offsetHours) * 3_600_000);
  const end = new Date(start.getTime() + 45 * 60_000);
  return {
    startAtUtc: start.toISOString(),
    endAtUtc: end.toISOString(),
    label: `QA ${start.toISOString()}`,
  };
}

async function book(
  request: APIRequestContext,
  body: Record<string, unknown>,
  idempotencyKey: string,
) {
  return request.post("/api/bookings", {
    headers: { ...HEADERS, "x-idempotency-key": idempotencyKey },
    timeout: 60_000, // dev: first-hit route compile can spike well past the 20s action default
    data: {
      providerId: PROVIDER_ID,
      serviceId: SERVICE_ID,
      clientName: "QA Guest",
      clientPhone: "+79990000300",
      // RKN-FIX-02: these are GUEST bookings, and a guest booking without the
      // two required consents is now refused (400 CONSENT_REQUIRED) before
      // anything is created — so the harness ticks what a real guest ticks.
      // Marketing stays false: optional by law, and the QA phones should not
      // accumulate a marketing consent nobody asked for.
      consent: { terms: true, pdProcessing: true, marketing: false },
      ...body,
    },
  });
}

test("valid future booking succeeds and is PENDING", async ({ request }) => {
  const slot = uniqueSlot(0);
  const res = await book(
    request,
    { startAtUtc: slot.startAtUtc, endAtUtc: slot.endAtUtc, slotLabel: slot.label },
    `qa-valid-${slot.startAtUtc}`,
  );
  expect(res.status()).toBe(201);
  const json = await res.json();
  expect(json.ok).toBe(true);
  expect(json.data.booking.service.id).toBe(SERVICE_ID);
  expect(json.data.booking.status).toBe("PENDING"); // autoConfirm=false
  // Stored time is UTC (rule 8) — exactly what we requested.
  expect(json.data.booking.startAtUtc).toBe(slot.startAtUtc);
});

test("double-booking the same slot is rejected (SLOT_CONFLICT)", async ({ request }) => {
  const slot = uniqueSlot(1);
  const first = await book(
    request,
    { startAtUtc: slot.startAtUtc, endAtUtc: slot.endAtUtc, slotLabel: slot.label },
    `qa-dup-a-${slot.startAtUtc}`,
  );
  expect(first.status()).toBe(201);

  // Different idempotency key + phone → a genuine second attempt, not a replay.
  const second = await book(
    request,
    { startAtUtc: slot.startAtUtc, endAtUtc: slot.endAtUtc, slotLabel: slot.label, clientPhone: "+79990000301" },
    `qa-dup-b-${slot.startAtUtc}`,
  );
  expect(second.status()).toBe(409);
  expect((await second.json()).error.code).toBe("SLOT_CONFLICT");
});

test("partial overlap is rejected (SLOT_CONFLICT)", async ({ request }) => {
  const slot = uniqueSlot(2);
  const base = await book(
    request,
    { startAtUtc: slot.startAtUtc, endAtUtc: slot.endAtUtc, slotLabel: slot.label },
    `qa-ov-base-${slot.startAtUtc}`,
  );
  expect(base.status()).toBe(201);

  const overlapStart = new Date(new Date(slot.startAtUtc).getTime() + 30 * 60_000);
  const overlapEnd = new Date(overlapStart.getTime() + 45 * 60_000);
  const overlap = await book(
    request,
    {
      startAtUtc: overlapStart.toISOString(),
      endAtUtc: overlapEnd.toISOString(),
      slotLabel: `QA overlap ${overlapStart.toISOString()}`,
      clientPhone: "+79990000302",
    },
    `qa-ov-hit-${slot.startAtUtc}`,
  );
  expect(overlap.status()).toBe(409);
  expect((await overlap.json()).error.code).toBe("SLOT_CONFLICT");
});

test("minBookingHoursAhead is enforced (BOOKING_TOO_SOON)", async ({ request }) => {
  const start = new Date(Date.now() + 30 * 60_000); // 30 min ahead < 2h policy
  const end = new Date(start.getTime() + 45 * 60_000);
  const res = await book(
    request,
    { startAtUtc: start.toISOString(), endAtUtc: end.toISOString(), slotLabel: "QA too soon" },
    `qa-soon-${start.toISOString()}`,
  );
  expect(res.status()).toBe(400);
  expect((await res.json()).error.code).toBe("BOOKING_TOO_SOON");
});

test("maxBookingDaysAhead is enforced (BOOKING_TOO_FAR)", async ({ request }) => {
  const start = new Date(Date.now() + 200 * 24 * 3_600_000); // 200 days > 90d policy
  const end = new Date(start.getTime() + 45 * 60_000);
  const res = await book(
    request,
    { startAtUtc: start.toISOString(), endAtUtc: end.toISOString(), slotLabel: "QA too far" },
    `qa-far-${start.toISOString()}`,
  );
  expect(res.status()).toBe(400);
  expect((await res.json()).error.code).toBe("BOOKING_TOO_FAR");
});
