import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { addDaysToDateKey, compareDateKeys } from "@/lib/schedule/dateKey";
import { toLocalDateKey, toLocalDateKeyExclusive } from "@/lib/schedule/timezone";

/**
 * FIX-TIMEBLOCK-ENFORCEMENT-01 — the single source of truth that turns a
 * `TimeBlock` row into a real availability constraint.
 *
 * Background: `TimeBlock` (studio-created, per team-master ad-hoc BREAK/BLOCK
 * window, stored as UTC instants `startAt`/`endAt`) used to be read by exactly
 * two DISPLAY surfaces (master week grid + studio calendar) and by NOTHING in
 * slot generation or the conflict check — so the calendar drew the block while
 * clients booked straight through it (a direct guest `POST /api/bookings` at the
 * blocked start returned 201).
 *
 * A2 decision (own-enforcement, NOT unified into the break path): `TimeBlock`
 * is a one-off UTC-instant window shaped like a `Booking` (ad-hoc, per-master,
 * concrete instants), NOT like a `ScheduleBreak` (recurring salon-local `HH:MM`
 * strings that live on the schedule template and materialize into
 * `DayPlan.breaks`). So it is enforced in its OWN right — but by REUSING the two
 * machineries bookings already flow through, never a third bespoke comparison:
 *   1. slot generation — `loadTimeBlockRanges` + `bucketRangesByDateKey` feed the
 *      blocks into `buildSlotsForDay` as UTC ranges, alongside bookings;
 *   2. the conflict check — `assertNoTimeBlockConflict` is the ONE primitive
 *      reused at every create/move site (`ensureNoConflicts`, studio create/move,
 *      reschedule confirm).
 *
 * Buffer: a block is a HARD window with NO buffer — it mirrors `ScheduleBreak`
 * (breaks are applied raw in `buildSlotsForDay`) and the semantics ("this master
 * is unavailable exactly 16:30–17:30"); the between-bookings buffer is turnaround
 * time between client appointments, which a declared absence does not need. A
 * booking may therefore abut a block (end exactly at its start).
 *
 * Instant-based: `TimeBlock.startAt`/`endAt` are UTC instants (the write path
 * converts salon-local hours → UTC). Every comparison here is a raw UTC overlap
 * (`startAt < endInstant && endAt > startInstant`) — never a local-hour compare —
 * so a +5 salon's 16:30–17:30 block gates exactly those salon hours (SKILL-TZ-01).
 */

type DbClient = Prisma.TransactionClient | typeof prisma;

/** Owner id of a `TimeBlock` — always the (studio) master's `Provider.id`. */
export type TimeBlockRange = { startAtUtc: Date; endAtUtc: Date };

/**
 * Load a master's `TimeBlock`s overlapping a UTC window as raw UTC ranges.
 *
 * Keyed on `masterId` only (never `studioId`): a master's blocked time is the
 * master's time regardless of which studio created it, and this is exactly the
 * predicate the master week grid already uses. BREAK and BLOCK are BOTH loaded —
 * both mean "unavailable" (the type is only a display distinction).
 */
export async function loadTimeBlockRanges(
  masterProviderId: string,
  fromUtc: Date,
  toExclusiveUtc: Date,
): Promise<TimeBlockRange[]> {
  const blocks = await prisma.timeBlock.findMany({
    where: {
      masterId: masterProviderId,
      startAt: { lt: toExclusiveUtc },
      endAt: { gt: fromUtc },
    },
    select: { startAt: true, endAt: true },
    orderBy: { startAt: "asc" },
  });
  return blocks.map((block) => ({ startAtUtc: block.startAt, endAtUtc: block.endAt }));
}

/**
 * Bucket UTC ranges into salon-local date keys (mirrors the booking bucketing
 * in `usecases.ts` so a block spanning a salon-local day boundary is offered to
 * each affected day). Optional clamp keys keep out-of-range days out of the map.
 */
export function bucketRangesByDateKey(
  ranges: TimeBlockRange[],
  timezone: string,
  clampStartKey?: string,
  clampEndKeyExclusive?: string,
): Map<string, TimeBlockRange[]> {
  const byKey = new Map<string, TimeBlockRange[]>();
  for (const range of ranges) {
    let startKey = toLocalDateKey(range.startAtUtc, timezone);
    let endKeyExclusive = toLocalDateKeyExclusive(range.endAtUtc, timezone);
    if (clampStartKey && compareDateKeys(startKey, clampStartKey) < 0) startKey = clampStartKey;
    if (clampEndKeyExclusive && compareDateKeys(endKeyExclusive, clampEndKeyExclusive) > 0) {
      endKeyExclusive = clampEndKeyExclusive;
    }
    if (compareDateKeys(startKey, endKeyExclusive) >= 0) continue;

    let cursor = startKey;
    while (compareDateKeys(cursor, endKeyExclusive) < 0) {
      const list = byKey.get(cursor) ?? [];
      list.push(range);
      byKey.set(cursor, list);
      cursor = addDaysToDateKey(cursor, 1);
    }
  }
  return byKey;
}

/** True iff any active `TimeBlock` for the master overlaps [startAtUtc, endAtUtc). */
export async function hasConflictingTimeBlock(
  db: DbClient,
  input: { masterProviderId: string; startAtUtc: Date; endAtUtc: Date },
): Promise<boolean> {
  const block = await db.timeBlock.findFirst({
    where: {
      masterId: input.masterProviderId,
      // Hard window, no buffer: overlap is a raw UTC-instant compare.
      startAt: { lt: input.endAtUtc },
      endAt: { gt: input.startAtUtc },
    },
    select: { id: true },
  });
  return block !== null;
}

/**
 * The ONE conflict-side enforcement primitive. Reused at every create/move site
 * so blocked time is never ACCEPTED, even by a direct API call (closes the
 * TOCTOU hole slot-generation alone leaves open). Runs inside the caller's
 * Serializable transaction (pass the tx client) on the write paths.
 */
export async function assertNoTimeBlockConflict(
  db: DbClient,
  input: { masterProviderId: string; startAtUtc: Date; endAtUtc: Date },
): Promise<void> {
  if (await hasConflictingTimeBlock(db, input)) {
    throw new AppError(
      "Это время закрыто для записи. Пожалуйста, выберите другое окошко.",
      409,
      "TIME_BLOCKED",
    );
  }
}
