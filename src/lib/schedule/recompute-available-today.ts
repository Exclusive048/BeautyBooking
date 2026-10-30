import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logging/logger";
import { hasFreeSlotToday, providerHasFreeSlotToday } from "@/lib/schedule/available-today";
import {
  computeFreeSlotKeys,
  sameFreeSlotKeys,
  type FreeSlotProbeProvider,
} from "@/lib/schedule/free-slot-keys";

/**
 * CATALOG-AVAILABLE-TODAY — Phase 2: the recompute sweep.
 *
 * Recomputes `Provider.availableToday` for EVERY published provider (the
 * catalog set) via the Phase-1 pure helper, and persists ONLY the diffs.
 *
 * 🔴 SERVER-ONLY (rule 13): Prisma + ScheduleEngine (transitively). Not
 * client-importable.
 *
 * 🔴 ENGINE-SAFETY — a consumer + a column write, NOT an engine change. It
 * loops the Phase-1 helper (`getDayPlanFromContext` + pure `buildSlotsForDay`,
 * no slots-cache write) and writes ONLY `availableToday`. Slot generation is
 * untouched (SHA byte-identical).
 *
 * Guardrails:
 *  - **Minimal-write:** compute → conditional `updateMany` right away
 *    (`availableToday: { not: free }` — an unchanged row is never touched;
 *    AVAILABLE-TODAY-SWEEP-WRITE replaced the end-of-pass batch, see below).
 *  - **Resilient:** each provider's probe is try/caught → on throw, `logError`
 *    + CONTINUE. A broken provider keeps its PREVIOUS value (not flipped to
 *    false — that would hide real availability) and never aborts the sweep.
 *  - **Observable:** returns `{ total, changed, errored, erroredIds }`.
 *
 * Not scheduled yet — Phase 3 adds the worker `setInterval`. This runs
 * on-demand (the token-gated trigger endpoint + the verify script).
 */

export type RecomputeAvailableTodaySummary = {
  total: number;
  changed: number;
  errored: number;
  erroredIds: string[];
  /** CATALOG-DATE-TIME-FILTER: сколько снимков свободного времени переписано. */
  freeSlotKeysChanged?: number;
};

/**
 * CATALOG-DATE-TIME-FILTER — снимок свободного времени пересчитывается тем же
 * проходом, что и `availableToday`, и так же устойчив: сбой одного провайдера
 * оставляет ему прежний снимок (не пустой — пустой спрятал бы его из фильтра
 * «когда») и не прерывает проход. Пишется только изменившийся снимок.
 */
async function refreshFreeSlotKeys(
  provider: FreeSlotProbeProvider & { type: ProviderType; freeSlotKeys: string[] },
  now: Date,
  summary: RecomputeAvailableTodaySummary,
): Promise<void> {
  try {
    const keys = await computeFreeSlotKeys(provider, now);
    if (sameFreeSlotKeys(keys, provider.freeSlotKeys)) return;
    await prisma.provider.update({ where: { id: provider.id }, data: { freeSlotKeys: keys } });
    summary.freeSlotKeysChanged = (summary.freeSlotKeysChanged ?? 0) + 1;
  } catch (error) {
    logError("freeSlotKeys.recompute.provider-failed", {
      providerId: provider.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function recomputeAvailableToday(
  now: Date = new Date(),
): Promise<RecomputeAvailableTodaySummary> {
  const providers = await prisma.provider.findMany({
    where: { isPublished: true },
    select: {
      id: true,
      type: true,
      availableToday: true,
      // Probe fields (AvailabilityProbeProvider) — so MASTER rows probe
      // without a re-query; studios re-resolve their masters in the helper.
      timezone: true,
      slotStepMin: true,
      minBookingHoursAhead: true,
      bufferBetweenBookingsMin: true,
      // CATALOG-DATE-TIME-FILTER: поля снимка свободного времени.
      maxBookingDaysAhead: true,
      visibleSlotDays: true,
      freeSlotKeys: true,
    },
  });

  const freeSlotSummary: RecomputeAvailableTodaySummary = {
    total: 0,
    changed: 0,
    errored: 0,
    erroredIds: [],
  };
  let changed = 0;
  const erroredIds: string[] = [];

  for (const provider of providers) {
    try {
      const free =
        provider.type === ProviderType.MASTER
          ? await providerHasFreeSlotToday(provider, now)
          : // STUDIO → OR over its ACTIVE masters (re-resolved in the helper).
            await hasFreeSlotToday(provider.id, now);
      // AVAILABLE-TODAY-SWEEP-WRITE (находка B-06, 2026-10-30): флаг пишется
      // СРАЗУ после расчёта провайдера и той же формой, что и точечный пересчёт.
      // Раньше перевороты копились по всему проходу (на сотнях провайдеров —
      // минуты) и писались в конце безусловным `updateMany`, то есть значением,
      // посчитанным минуты назад, поверх того, что успел записать точечный
      // пересчёт после новой записи или отмены: каталог до следующего свипа
      // (до 30 мин) показывал «Свободно сегодня» у мастера без окошек или прятал
      // свободного. Теперь окно гонки — длительность одной пробы.
      //
      // Сравнения со снимком начала прохода (`provider.availableToday`) здесь
      // нет намеренно: снимок к этому моменту мог устареть, и пропуск по нему
      // оставил бы в базе устаревшее значение точечного пересчёта. Условие
      // `not: free` держит минимальную запись на уровне строки — совпавшее
      // значение строку не трогает, а `count` говорит, что перевёрнуто на деле.
      const { count } = await prisma.provider.updateMany({
        where: { id: provider.id, availableToday: { not: free } },
        data: { availableToday: free },
      });
      changed += count;
    } catch (error) {
      erroredIds.push(provider.id);
      logError("availableToday.recompute.provider-failed", {
        providerId: provider.id,
        error: error instanceof Error ? error.message : String(error),
      });
      // keep the previous stored value
    }

    await refreshFreeSlotKeys(provider, now, freeSlotSummary);
  }

  return {
    total: providers.length,
    changed,
    errored: erroredIds.length,
    erroredIds,
    freeSlotKeysChanged: freeSlotSummary.freeSlotKeysChanged ?? 0,
  };
}

/**
 * CATALOG-AVAILABLE-TODAY — Phase 4: targeted single-provider recompute.
 *
 * Recomputes ONE provider's `availableToday` (same pure read path + minimal
 * write as the sweep), and — for a MASTER that belongs to a studio — fans out
 * to that studio too (a studio is free-today iff any active master is, so a
 * master's change can flip the studio). Fired per-mutation from the slot-cache
 * invalidation hooks (via a queued `availableToday.recompute` job), giving
 * near-real-time freshness. The 30-min sweep stays as the reconciling backstop.
 *
 * 🔴 ENGINE-SAFETY: reuses ONLY the Phase-1 pure helpers
 * (`providerHasFreeSlotToday` / `hasFreeSlotToday`) — `getDayPlanFromContext` +
 * pure `buildSlotsForDay`, never `listAvailabilitySlotsPaginated` /
 * `setCachedSlotsForDate`. Writes only `Provider.availableToday`. Slot
 * generation is untouched.
 */
async function recomputeOneProvider(
  providerId: string,
  now: Date,
  summary: RecomputeAvailableTodaySummary,
): Promise<{ studioId: string | null } | null> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: {
      id: true,
      type: true,
      availableToday: true,
      // A master's change also affects its studio (fan-out target).
      studioId: true,
      // Probe fields (AvailabilityProbeProvider) — MASTER probes without a re-query.
      timezone: true,
      slotStepMin: true,
      minBookingHoursAhead: true,
      bufferBetweenBookingsMin: true,
      // CATALOG-DATE-TIME-FILTER: поля снимка свободного времени.
      maxBookingDaysAhead: true,
      visibleSlotDays: true,
      freeSlotKeys: true,
    },
  });
  if (!provider) return null;
  summary.total += 1;
  await refreshFreeSlotKeys(provider, now, summary);

  const free =
    provider.type === ProviderType.MASTER
      ? await providerHasFreeSlotToday(provider, now)
      : // STUDIO → OR over its ACTIVE masters (re-resolved in the helper).
        await hasFreeSlotToday(provider.id, now);

  if (free !== provider.availableToday) {
    // Minimal-write + race-safe: only touch the row when the value differs
    // (the `if` skips the query in the common no-op case; the `not` guards a
    // concurrent flip between read and write).
    await prisma.provider.updateMany({
      where: { id: provider.id, availableToday: { not: free } },
      data: { availableToday: free },
    });
    summary.changed += 1;
  }

  return {
    studioId: provider.type === ProviderType.MASTER ? provider.studioId : null,
  };
}

export async function recomputeAvailableTodayForProvider(
  providerId: string,
  now: Date = new Date(),
): Promise<RecomputeAvailableTodaySummary> {
  const summary: RecomputeAvailableTodaySummary = {
    total: 0,
    changed: 0,
    errored: 0,
    erroredIds: [],
  };

  let studioId: string | null = null;
  try {
    const result = await recomputeOneProvider(providerId, now, summary);
    studioId = result?.studioId ?? null;
  } catch (error) {
    summary.errored += 1;
    summary.erroredIds.push(providerId);
    logError("availableToday.recompute.provider-failed", {
      providerId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fan-out: a master's availability change also flips its studio's
  // `availableToday`. Skipped if the master probe failed above (the sweep
  // reconciles). A STUDIO provider has `studioId = null` → no recursion.
  if (studioId) {
    try {
      await recomputeOneProvider(studioId, now, summary);
    } catch (error) {
      summary.errored += 1;
      summary.erroredIds.push(studioId);
      logError("availableToday.recompute.provider-failed", {
        providerId: studioId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summary;
}
