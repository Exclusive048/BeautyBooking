import { prisma } from "@/lib/prisma";
import { AppError, type ErrorCode, toAppError } from "@/lib/api/errors";
import { BookingPackageStatus, BookingSource } from "@prisma/client";
import { createBookingRow } from "@/lib/bookings/booking-row";
import { bookingTransaction } from "@/lib/bookings/booking-transaction";
import {
  ensureNoConflicts,
  resolveBookingCore,
  type BookingCoreContext,
} from "@/lib/bookings/booking-core";
import {
  proportionalDiscountedPrices,
  packageFinalTotal,
  intraPackageOverlapMultiMaster,
} from "@/lib/bookings/package-math";
import { toKopeks } from "@/lib/money/kopeks";
import {
  loadPackageForBooking,
  mapPrismaBookingConflict,
  type LoadedPackageRecord,
  type CreateSoloPackageResult,
} from "@/lib/bookings/package-booking";
import { invalidateSlotsForBookingRange } from "@/lib/bookings/slot-invalidation";
import { scheduleBookingRemindersSafe } from "@/lib/bookings/reminders";
import {
  abortPackageIdempotency,
  beginPackageIdempotency,
  completePackageIdempotency,
} from "@/lib/bookings/package-idempotency";
import { invalidateAdvisorCache } from "@/lib/advisor/cache";
import { logError } from "@/lib/logging/logger";

/**
 * PACKAGE-BOOKING-MVP-2 — studio multi-master sequential package booking.
 *
 * Completes the package feature (solo MVP-1 + studio MVP-2). This REUSES the
 * hardened MVP-1 atomic-package skeleton (`createSoloPackageBooking`) — the
 * outer Serializable tx, per-component `resolveBookingCore`, the all-or-none
 * discipline, proportional discount, and the P2034/P2002→409 mapping — it does
 * NOT fork it. The studio per-component differences:
 *
 *   - each component carries the CLIENT-CHOSEN `masterProviderId`. Passing it
 *     to `resolveBookingCore` (studio branch) enforces, per component:
 *       · master belongs to the studio,
 *       · the chosen master has an ENABLED `MasterService` for the service —
 *         i.e. `assertMasterPerformsService` (surfaced as SERVICE_INVALID 409),
 *       · salon-tz availability via the schedule engine — i.e. the master's
 *         salon-tz work-hours + per-master conflicts (FIX-R2-04-BA: the engine
 *         reads each master's own tz, so the work-hours window is in salon time
 *         — exactly as the public studio funnel does),
 *       · the per-master effective price/duration via the override,
 *       · the booking window (min/max ahead, accept-new-clients).
 *
 *   - the intra-package overlap is BY-CLIENT (the MVP-2 invariant): the N
 *     siblings are sequential along the ONE client's timeline even across
 *     different masters (no parallel placement). `intraPackageOverlapMultiMaster`
 *     pairwise-checks the client windows (different masters → pure non-overlap,
 *     same master twice → also the master's buffer). This is the axis the solo
 *     by-master check does NOT model.
 *
 * Cancel-whole + the lone-child guard + reschedule-parts are shared verbatim
 * with MVP-1 (`cancelSoloPackageBooking` operates on any BookingPackage; the
 * `cancelBooking` PACKAGE_CANCEL_WHOLE guard keys on `bookingPackageId`;
 * reschedule never touches `bookingPackageId`).
 */

type LoadedStudioPackage = LoadedPackageRecord & { studioId: string };

/** Loads a package for STUDIO booking (lifts the MVP-1 solo gate). */
export async function loadStudioPackage(packageId: string): Promise<LoadedStudioPackage> {
  const pkg = await loadPackageForBooking(packageId);
  if (pkg.kind !== "studio" || !pkg.studioId) {
    throw new AppError("На этот пакет записывают в кабинете студии.", 400, "PACKAGE_NOT_STUDIO");
  }
  return { ...pkg, studioId: pkg.studioId };
}

export type StudioPackageSelection = {
  serviceId: string;
  masterProviderId: string;
  startAtUtc: Date;
};

export type StudioProposedComponent = {
  serviceId: string;
  name: string;
  masterProviderId: string;
  startAtUtc: string;
  endAtUtc: string;
  durationMin: number;
  discountedPrice: number;
};

export type StudioProposeResult =
  | {
      ok: true;
      packageId: string;
      packageName: string;
      totalKopeks: number;
      components: StudioProposedComponent[];
    }
  | {
      ok: false;
      code: ErrorCode;
      message: string;
      failedComponentIndex?: number;
      failedComponentName?: string;
    };

/**
 * Re-orders the client's selections into the package's `sortOrder`, validating
 * that they cover exactly the package components (one selection per service).
 * Throws PACKAGE_MISMATCH on any drift (so the client re-loads a stale cart).
 */
function orderSelections(
  pkg: LoadedStudioPackage,
  selections: StudioPackageSelection[],
): Array<{ component: LoadedPackageRecord["components"][number]; selection: StudioPackageSelection }> {
  if (selections.length !== pkg.components.length) {
    throw new AppError("Состав пакета изменился. Обновите страницу.", 409, "PACKAGE_MISMATCH");
  }
  const byService = new Map(selections.map((s) => [s.serviceId, s]));
  return pkg.components.map((component) => {
    const selection = byService.get(component.serviceId);
    if (!selection) {
      throw new AppError("Состав пакета изменился. Обновите страницу.", 409, "PACKAGE_MISMATCH");
    }
    return { component, selection };
  });
}

/**
 * Validates the client's chosen (master + slot) per component + prices the
 * package for the review screen. Advisory only — `createStudioPackageBooking`
 * re-validates authoritatively. `clientUserId` is threaded so the
 * accept-new-clients check matches the eventual create (a returning client
 * isn't prematurely blocked).
 */
export async function proposeStudioPackagePlacement(input: {
  packageId: string;
  selections: StudioPackageSelection[];
  clientUserId?: string | null;
}): Promise<StudioProposeResult> {
  const pkg = await loadStudioPackage(input.packageId);
  const ordered = orderSelections(pkg, input.selections);

  const cores: BookingCoreContext[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const { component, selection } = ordered[i]!;
    try {
      const core = await resolveBookingCore({
        providerId: pkg.providerId,
        serviceId: component.serviceId,
        masterProviderId: selection.masterProviderId,
        clientUserId: input.clientUserId ?? null,
        startAtUtc: selection.startAtUtc,
      });
      cores.push(core);
    } catch (error) {
      const appError = toAppError(error);
      return {
        ok: false,
        code: appError.code,
        message: appError.message,
        failedComponentIndex: i,
        failedComponentName: component.name,
      };
    }
  }

  // By-client overlap (the MVP-2 invariant) — the one client can't be in two
  // chairs, even with different masters.
  const placement = cores.map((core) => ({
    startAtUtc: core.startAtUtc,
    endAtUtc: core.endAtUtc,
    masterProviderId: core.resolvedMasterProviderId,
    bufferMin: core.bufferMin,
  }));
  if (intraPackageOverlapMultiMaster(placement)) {
    return {
      ok: false,
      code: "SLOT_CONFLICT",
      message: "Услуги пакета пересекаются по времени. Выберите другое время.",
    };
  }

  const prices = cores.map((c) => toKopeks(c.service.effectivePrice));
  const finalTotal = packageFinalTotal(
    prices,
    pkg.discountType as "PERCENT" | "FIXED",
    pkg.discountValue,
  );
  const split = proportionalDiscountedPrices(prices, finalTotal);

  return {
    ok: true,
    packageId: pkg.id,
    packageName: pkg.name,
    totalKopeks: finalTotal,
    components: ordered.map((o, i) => ({
      serviceId: o.component.serviceId,
      name: o.component.name,
      masterProviderId: cores[i]!.resolvedMasterProviderId ?? o.selection.masterProviderId,
      startAtUtc: cores[i]!.startAtUtc.toISOString(),
      endAtUtc: cores[i]!.endAtUtc.toISOString(),
      durationMin: cores[i]!.durationMin,
      discountedPrice: split[i]!,
    })),
  };
}

/**
 * Atomic studio package create. Reuses the MVP-1 skeleton: validates each
 * chosen (master + slot) via `resolveBookingCore` (studio branch — see header),
 * runs the by-client overlap guard, then creates the BookingPackage + N
 * Bookings + N BookingServiceItems in ONE Serializable transaction. Any
 * conflict / placement failure rolls the whole thing back — no partial package.
 */
type CreateStudioPackageInput = {
  packageId: string;
  /**
   * FIX-B15 — пакет создаётся только для резолвнутого профиля (RKN-FIX-02),
   * поэтому не nullable. Оба роута объявляют локальную переменную как `string`;
   * тип фиксирует это на границе, а не оставляет соглашению.
   */
  clientUserId: string;
  clientName: string;
  clientPhone: string;
  comment?: string | null;
  silentMode?: boolean;
  /** Chosen master + slot, one per component. serviceId must belong to the package. */
  selections: StudioPackageSelection[];
  /** LOGIC-09 (инв. #28) — см. одноимённый параметр solo-близнеца. */
  idempotencyKey?: string | null;
};

export async function createStudioPackageBooking(
  input: CreateStudioPackageInput,
): Promise<CreateSoloPackageResult> {
  const guard = await beginPackageIdempotency({
    idempotencyKey: input.idempotencyKey,
    clientUserId: input.clientUserId,
  });
  if (guard.cached) return guard.cached;

  let result: CreateSoloPackageResult;
  try {
    result = await createStudioPackageBookingUnguarded(input);
  } catch (error) {
    await abortPackageIdempotency(guard.heldKey);
    throw error;
  }
  await completePackageIdempotency(guard.heldKey, result.bookingPackageId);
  return result;
}

async function createStudioPackageBookingUnguarded(
  input: CreateStudioPackageInput,
): Promise<CreateSoloPackageResult> {
  const pkg = await loadStudioPackage(input.packageId);
  const ordered = orderSelections(pkg, input.selections);

  // 1. Validate each component through the SAME core as a single studio booking
  //    (master-belongs-to-studio + MasterService enabled + salon-tz
  //    availability/work-hours + per-master price/duration + window).
  const cores: BookingCoreContext[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const { component, selection } = ordered[i]!;
    const core = await resolveBookingCore({
      providerId: pkg.providerId,
      serviceId: component.serviceId,
      masterProviderId: selection.masterProviderId,
      clientUserId: input.clientUserId,
      startAtUtc: selection.startAtUtc,
    });
    cores.push(core);
  }

  // 2. By-client intra-package overlap (MVP-2 invariant) — different masters
  //    can otherwise both be "free" at the same instant, but the ONE client
  //    can't be in two chairs. `ensureNoConflicts` (per master) can't see this.
  const placement = cores.map((core) => ({
    startAtUtc: core.startAtUtc,
    endAtUtc: core.endAtUtc,
    masterProviderId: core.resolvedMasterProviderId,
    bufferMin: core.bufferMin,
  }));
  if (intraPackageOverlapMultiMaster(placement)) {
    throw new AppError(
      "Услуги пакета пересекаются по времени. Выберите другое время.",
      409,
      "SLOT_CONFLICT",
    );
  }

  // 3. Proportional discounted price per component (Σ === final, exact kopeks).
  const prices = cores.map((c) => toKopeks(c.service.effectivePrice));
  const finalTotal = packageFinalTotal(
    prices,
    pkg.discountType as "PERCENT" | "FIXED",
    pkg.discountValue,
  );
  const split = proportionalDiscountedPrices(prices, finalTotal);

  // Studio never auto-confirms (resolveBookingCore returns false for a studio
  // provider) → every child is PENDING + actionRequiredBy MASTER.
  const shouldAutoConfirm = cores[0]?.shouldAutoConfirm ?? false;

  // 4. Pre-tx conflict check per component (each on its chosen master).
  for (const core of cores) {
    await ensureNoConflicts(prisma, {
      providerId: pkg.providerId,
      masterProviderId: core.resolvedMasterProviderId,
      startAtUtc: core.startAtUtc,
      endAtUtc: core.endAtUtc,
      bufferMin: core.bufferMin,
    });
  }

  // 5. Atomic create — all-or-none.
  let result: CreateSoloPackageResult;
  try {
    result = await bookingTransaction(
      async (tx) => {
        const bookingPackage = await tx.bookingPackage.create({
          data: {
            servicePackageId: pkg.id,
            providerId: pkg.providerId,
            clientUserId: input.clientUserId,
            discountType: pkg.discountType,
            discountValue: pkg.discountValue,
            totalKopeks: finalTotal,
            status: BookingPackageStatus.ACTIVE,
          },
          select: { id: true },
        });

        const bookingIds: string[] = [];
        for (let i = 0; i < cores.length; i += 1) {
          const core = cores[i]!;
          // In-tx conflict re-check (Serializable snapshot) per component. For
          // a same-master sibling, the EARLIER-created child is already visible
          // here (read-your-writes), so the master's buffer is enforced.
          await ensureNoConflicts(tx, {
            providerId: pkg.providerId,
            masterProviderId: core.resolvedMasterProviderId,
            startAtUtc: core.startAtUtc,
            endAtUtc: core.endAtUtc,
            bufferMin: core.bufferMin,
          });

          const created = await createBookingRow(tx, {
            data: {
              providerId: pkg.providerId,
              // FIX-C1: `studioId` больше не передаётся — writer выводит его из
              // `providerId` (у студийного пакета это провайдер студии, то есть
              // ровно тот `Studio.id`, что стоял здесь раньше).
              source: BookingSource.WEB,
              serviceId: core.service.id,
              masterProviderId: core.resolvedMasterProviderId,
              masterId: core.resolvedMasterProviderId ?? pkg.providerId,
              startAtUtc: core.startAtUtc,
              endAtUtc: core.endAtUtc,
              slotLabel: core.startAtUtc.toISOString(),
              clientName: input.clientName,
              clientPhone: input.clientPhone,
              comment: input.comment ?? null,
              silentMode: input.silentMode ?? false,
              clientUserId: input.clientUserId,
              bookingPackageId: bookingPackage.id,
              status: shouldAutoConfirm ? "CONFIRMED" : "PENDING",
              actionRequiredBy: shouldAutoConfirm ? null : "MASTER",
            },
            select: { id: true },
          });

          await tx.bookingServiceItem.create({
            data: {
              bookingId: created.id,
              studioId: pkg.studioId,
              serviceId: core.service.id,
              titleSnapshot: core.service.title?.trim() || core.service.name,
              priceSnapshot: split[i]!,
              durationSnapshotMin: core.durationMin,
            },
          });

          bookingIds.push(created.id);
        }

        return { bookingPackageId: bookingPackage.id, bookingIds, totalKopeks: finalTotal };
      },
      // FIX-C6: изоляцию ставит `bookingTransaction` (инв. #31).
    );
  } catch (error) {
    const conflict = mapPrismaBookingConflict(error);
    if (conflict) throw conflict;
    throw error;
  }

  // RES-15: напоминания на каждый компонент — см. соло-путь. Здесь компоненты
  // ещё и у разных мастеров, но напоминание привязано к брони, а не к мастеру.
  if (shouldAutoConfirm) {
    for (const bookingId of result.bookingIds) {
      await scheduleBookingRemindersSafe(bookingId);
    }
  }

  // Post-tx slot-cache + advisor invalidation per child (best-effort, non-fatal).
  const invalidatedMasterIds = new Set<string>();
  for (const core of cores) {
    try {
      await invalidateSlotsForBookingRange({
        providerId: pkg.providerId,
        masterProviderId: core.resolvedMasterProviderId,
        startAtUtc: core.startAtUtc,
        endAtUtc: core.endAtUtc,
      });
      if (core.resolvedMasterProviderId && !invalidatedMasterIds.has(core.resolvedMasterProviderId)) {
        invalidatedMasterIds.add(core.resolvedMasterProviderId);
        await invalidateAdvisorCache(core.resolvedMasterProviderId);
      }
    } catch (error) {
      logError("studio package booking slot invalidation failed", {
        bookingPackageId: result.bookingPackageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
