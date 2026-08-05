import { prisma } from "@/lib/prisma";
import { AppError, type ErrorCode, toAppError } from "@/lib/api/errors";
import {
  Prisma,
  ProviderType,
  BookingPackageStatus,
  DiscountType,
  BookingCancelledBy,
} from "@prisma/client";
import {
  ensureNoConflicts,
  resolveBookingCore,
  normalizeBufferMinutes,
  type BookingCoreContext,
} from "@/lib/bookings/booking-core";
import {
  proportionalDiscountedPrices,
  packageFinalTotal,
  intraPackageOverlap,
} from "@/lib/bookings/package-math";
import { toKopeks } from "@/lib/money/kopeks";
import {
  canCancelOrReschedule,
  ensureBookingActionWindow,
  ensureCancellationDeadline,
  resolveBookingRuntimeStatus,
} from "@/lib/bookings/flow";
import { invalidateSlotsForBookingRange } from "@/lib/bookings/slot-invalidation";
import { logError } from "@/lib/logging/logger";
import { applyBookingTransition } from "@/lib/bookings/transition";

/**
 * PACKAGE-BOOKING-MVP-1 — solo-master sequential package booking.
 *
 * Composes the hardened single-booking integrity (resolveBookingCore +
 * ensureNoConflicts + the in-tx Serializable + P2034/P2002→409 discipline)
 * — it does NOT fork it. The package-specific additions are:
 *   - proportional discounted price per component (Σ == final, exact kopeks),
 *   - the intra-package pairwise overlap check (siblings invisible to
 *     ensureNoConflicts mid-tx),
 *   - all-or-none: any component failure rolls back the whole package.
 *
 * Scope = SOLO master only (provider.type MASTER && !studioId). Studio
 * multi-master is MVP-2.
 */

export function mapPrismaBookingConflict(error: unknown): AppError | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002" || error.code === "P2034") {
      return new AppError(
        "Это время уже занято. Пожалуйста, выберите другое окошко.",
        409,
        "BOOKING_CONFLICT",
      );
    }
  }
  return null;
}

type SoloPackageComponent = {
  serviceId: string;
  name: string;
  title: string | null;
  effectivePrice: number;
  durationMin: number;
  sortOrder: number;
};

type LoadedSoloPackage = {
  id: string;
  name: string;
  providerId: string;
  timezone: string;
  minBookingHoursAhead: number;
  bufferMin: number;
  discountType: DiscountType;
  discountValue: number;
  components: SoloPackageComponent[];
};

/** Whether the owning provider is a solo master or a studio. */
export type PackageBookingKind = "solo" | "studio";

export type LoadedPackageComponent = {
  serviceId: string;
  name: string;
  title: string | null;
  /**
   * The component's catalog base price/duration (`basePrice ?? price`,
   * `baseDurationMin ?? durationMin`). SOLO masters serve their own catalog so
   * this IS the booked value. For STUDIO packages it's only indicative (the
   * card/preview) — the authoritative per-master price/duration comes from the
   * chosen master's MasterService override via `resolveBookingCore` at
   * propose/create time.
   */
  basePrice: number;
  baseDurationMin: number;
  sortOrder: number;
};

export type LoadedPackageRecord = {
  kind: PackageBookingKind;
  id: string;
  name: string;
  /** Solo: the master's own provider id. Studio: the studio's provider id (== ServicePackage.masterId). */
  providerId: string;
  /** Studio: the `Studio` row id (for `Booking.studioId`). Solo: null. */
  studioId: string | null;
  timezone: string;
  minBookingHoursAhead: number;
  /** Solo: the master's buffer. Studio: the studio-provider buffer (per-master buffers resolved in `resolveBookingCore`). */
  bufferMin: number;
  discountType: DiscountType;
  discountValue: number;
  components: LoadedPackageComponent[];
};

/**
 * Shared package loader (PACKAGE-BOOKING-MVP-2 lifted the solo gate). Loads the
 * package + its enabled/active components in `sortOrder`, resolves whether the
 * owning provider is a SOLO master or a STUDIO, and (for studio) the `Studio`
 * row id needed for `Booking.studioId`. Both `loadSoloPackage` (MVP-1) and
 * `loadStudioPackage` (MVP-2) wrap this — one query, one validation, no fork.
 */
export async function loadPackageForBooking(packageId: string): Promise<LoadedPackageRecord> {
  const pkg = await prisma.servicePackage.findUnique({
    where: { id: packageId },
    select: {
      id: true,
      name: true,
      masterId: true,
      isEnabled: true,
      discountType: true,
      discountValue: true,
      master: {
        select: {
          id: true,
          type: true,
          studioId: true,
          timezone: true,
          minBookingHoursAhead: true,
          bufferBetweenBookingsMin: true,
        },
      },
      items: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          serviceId: true,
          sortOrder: true,
          service: {
            select: {
              id: true,
              name: true,
              title: true,
              isEnabled: true,
              isActive: true,
              price: true,
              basePrice: true,
              durationMin: true,
              baseDurationMin: true,
            },
          },
        },
      },
    },
  });

  if (!pkg || !pkg.isEnabled) {
    throw new AppError("Пакет не найден.", 404, "PACKAGE_NOT_FOUND");
  }
  const master = pkg.master;
  if (!master) {
    throw new AppError("Пакет не найден.", 404, "PACKAGE_NOT_FOUND");
  }

  let kind: PackageBookingKind;
  let studioRowId: string | null = null;
  if (master.type === ProviderType.MASTER && !master.studioId) {
    kind = "solo";
  } else if (master.type === ProviderType.STUDIO) {
    kind = "studio";
    const studio = await prisma.studio.findFirst({
      where: { providerId: master.id },
      select: { id: true },
    });
    if (!studio) {
      // A STUDIO provider without a Studio row is a data anomaly — not bookable.
      throw new AppError("Бронирование пакета недоступно.", 400, "PACKAGE_NOT_BOOKABLE");
    }
    studioRowId = studio.id;
  } else {
    // A master that belongs to a studio (master.studioId set) doesn't own
    // public packages in this model — studio packages are owned by the STUDIO
    // provider. Treat as not bookable.
    throw new AppError("Бронирование пакета недоступно.", 400, "PACKAGE_NOT_BOOKABLE");
  }

  const components: LoadedPackageComponent[] = pkg.items
    .filter((item) => item.service && item.service.isEnabled && item.service.isActive)
    .map((item) => {
      const s = item.service!;
      return {
        serviceId: s.id,
        name: s.name,
        title: s.title,
        basePrice: s.basePrice ?? s.price,
        baseDurationMin: s.baseDurationMin ?? s.durationMin,
        sortOrder: item.sortOrder,
      };
    });

  if (components.length < 2) {
    throw new AppError("В пакете недостаточно доступных услуг.", 400, "PACKAGE_INCOMPLETE");
  }

  return {
    kind,
    id: pkg.id,
    name: pkg.name,
    providerId: master.id,
    studioId: studioRowId,
    timezone: master.timezone,
    minBookingHoursAhead: master.minBookingHoursAhead,
    bufferMin: normalizeBufferMinutes(master.bufferBetweenBookingsMin),
    discountType: pkg.discountType,
    discountValue: pkg.discountValue,
    components,
  };
}

/**
 * Loads a package for SOLO booking. SOLO masters serve their own catalog
 * services (no MasterService override — mirrors resolveBookingCore's solo
 * branch: basePrice ?? price, baseDurationMin ?? durationMin), so the loader's
 * base price/duration ARE the booked values here.
 */
export async function loadSoloPackage(packageId: string): Promise<LoadedSoloPackage> {
  const pkg = await loadPackageForBooking(packageId);
  if (pkg.kind !== "solo") {
    throw new AppError("Бронирование пакета доступно только у мастера.", 400, "PACKAGE_NOT_SOLO");
  }
  return {
    id: pkg.id,
    name: pkg.name,
    providerId: pkg.providerId,
    timezone: pkg.timezone,
    minBookingHoursAhead: pkg.minBookingHoursAhead,
    bufferMin: pkg.bufferMin,
    discountType: pkg.discountType,
    discountValue: pkg.discountValue,
    components: pkg.components.map((c) => ({
      serviceId: c.serviceId,
      name: c.name,
      title: c.title,
      effectivePrice: c.basePrice,
      durationMin: c.baseDurationMin,
      sortOrder: c.sortOrder,
    })),
  };
}

export type ProposedComponent = {
  serviceId: string;
  name: string;
  startAtUtc: string;
  endAtUtc: string;
  durationMin: number;
  discountedPrice: number;
};

export type ProposeResult =
  | {
      ok: true;
      packageId: string;
      packageName: string;
      totalKopeks: number;
      components: ProposedComponent[];
    }
  | {
      ok: false;
      code: ErrorCode;
      message: string;
      /** Index (sortOrder position) of the component that couldn't be placed. */
      failedComponentIndex?: number;
      failedComponentName?: string;
    };

export type SoloPackageSlot = { serviceId: string; startAtUtc: Date };

/**
 * Re-orders the client's chosen slots into the package's `sortOrder`,
 * validating that they cover exactly the package components (one slot per
 * service). Throws PACKAGE_MISMATCH on any drift (so the client re-loads a
 * stale cart). Mirrors the studio `orderSelections`; shared by propose +
 * create so placement and pricing align on the same order.
 */
function orderSoloSlots(
  pkg: LoadedSoloPackage,
  slots: SoloPackageSlot[],
): Array<{ component: SoloPackageComponent; startAtUtc: Date }> {
  if (slots.length !== pkg.components.length) {
    throw new AppError("Состав пакета изменился. Обновите страницу.", 409, "PACKAGE_MISMATCH");
  }
  const byService = new Map(slots.map((s) => [s.serviceId, s]));
  return pkg.components.map((component) => {
    const chosen = byService.get(component.serviceId);
    if (!chosen) {
      throw new AppError("Состав пакета изменился. Обновите страницу.", 409, "PACKAGE_MISMATCH");
    }
    return { component, startAtUtc: chosen.startAtUtc };
  });
}

/**
 * PACKAGE-SOLO-WIZARD-01 — validates the client's chosen per-component slots +
 * prices the package for the review screen. Mirrors
 * `proposeStudioPackagePlacement`: one `resolveBookingCore` per component
 * (service enabled + salon-tz availability/work-hours + booking window +
 * price/duration), the intra-package overlap guard, then the proportional
 * split.
 *
 * Advisory only — `createSoloPackageBooking` re-validates authoritatively.
 * `clientUserId` is threaded so the accept-new-clients check matches the
 * eventual create (a returning client isn't prematurely blocked).
 *
 * Replaces the MVP-1 single-anchor auto-sequencer, which greedily packed every
 * component into the SAME local day after one chosen start and failed the whole
 * package (`PACKAGE_PLACEMENT_FAILED`) on a busy day, with no way for the
 * client to place component N themselves. The wizard now picks a (date, time)
 * per component, so placement is the client's — this only validates + prices
 * it. Components may span different days; the client-timeline ORDER is held by
 * the widget cursor (the backend enforces non-overlap, not order — same
 * contract as studio).
 */
export async function proposeSoloPackageSelections(input: {
  packageId: string;
  slots: SoloPackageSlot[];
  clientUserId?: string | null;
}): Promise<ProposeResult> {
  const pkg = await loadSoloPackage(input.packageId);
  const ordered = orderSoloSlots(pkg, input.slots);

  const cores: BookingCoreContext[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const { component, startAtUtc } = ordered[i]!;
    try {
      const core = await resolveBookingCore({
        providerId: pkg.providerId,
        serviceId: component.serviceId,
        masterProviderId: null, // solo → resolvedMasterProviderId === provider.id
        clientUserId: input.clientUserId ?? null,
        startAtUtc,
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

  // Same-master siblings need the between-bookings buffer between them — and
  // they're invisible to `ensureNoConflicts` (uncommitted), so this mirrors the
  // guard `createSoloPackageBooking` will run.
  const bufferMin = cores[0]?.bufferMin ?? pkg.bufferMin;
  const placement = cores.map((core) => ({ startAtUtc: core.startAtUtc, endAtUtc: core.endAtUtc }));
  if (intraPackageOverlap(placement, bufferMin)) {
    return {
      ok: false,
      code: "SLOT_CONFLICT",
      message: "Услуги пакета пересекаются по времени. Выберите другое время.",
    };
  }

  const prices = cores.map((c) => toKopeks(c.service.effectivePrice));
  const finalTotal = packageFinalTotal(prices, pkg.discountType as "PERCENT" | "FIXED", pkg.discountValue);
  const split = proportionalDiscountedPrices(prices, finalTotal);

  return {
    ok: true,
    packageId: pkg.id,
    packageName: pkg.name,
    totalKopeks: finalTotal,
    components: ordered.map((o, i) => ({
      serviceId: o.component.serviceId,
      name: o.component.name,
      startAtUtc: cores[i]!.startAtUtc.toISOString(),
      endAtUtc: cores[i]!.endAtUtc.toISOString(),
      durationMin: cores[i]!.durationMin,
      discountedPrice: split[i]!,
    })),
  };
}

export type CreateSoloPackageResult = {
  bookingPackageId: string;
  bookingIds: string[];
  totalKopeks: number;
};

/**
 * Atomic package create. Validates each chosen component slot through the
 * existing single-booking core, runs the intra-package overlap guard, then
 * creates the BookingPackage + N Bookings + N BookingServiceItems in ONE
 * Serializable transaction. Any conflict / placement failure rolls the whole
 * thing back — no partial package. Commit-time P2034/P2002 → clean 409.
 */
export async function createSoloPackageBooking(input: {
  packageId: string;
  clientUserId: string | null;
  clientName: string;
  clientPhone: string;
  comment?: string | null;
  silentMode?: boolean;
  /** Chosen slots, one per component. serviceId must belong to the package. */
  slots: SoloPackageSlot[];
}): Promise<CreateSoloPackageResult> {
  const pkg = await loadSoloPackage(input.packageId);

  // The provided slots must cover exactly the package components (by service),
  // re-ordered into the package's sortOrder so placement + pricing align.
  const orderedSlots = orderSoloSlots(pkg, input.slots);

  // 1. Validate each component through the SAME core as a single booking
  //    (service enabled, window, availability, duration → start/end, price).
  const cores: BookingCoreContext[] = [];
  for (let i = 0; i < orderedSlots.length; i += 1) {
    const { component, startAtUtc } = orderedSlots[i]!;
    const core = await resolveBookingCore({
      providerId: pkg.providerId,
      serviceId: component.serviceId,
      masterProviderId: null, // solo → resolvedMasterProviderId === provider.id
      clientUserId: input.clientUserId,
      startAtUtc,
    });
    cores.push(core);
  }

  // 2. Intra-package overlap — ensureNoConflicts can't see these siblings.
  const bufferMin = cores[0]?.bufferMin ?? pkg.bufferMin;
  const placement = cores.map((core) => ({ startAtUtc: core.startAtUtc, endAtUtc: core.endAtUtc }));
  if (intraPackageOverlap(placement, bufferMin)) {
    throw new AppError(
      "Услуги пакета пересекаются по времени. Выберите другое начало.",
      409,
      "SLOT_CONFLICT",
    );
  }

  // 3. Proportional discounted price per component (Σ === final, exact).
  const finalTotal = packageFinalTotal(
    cores.map((c) => toKopeks(c.service.effectivePrice)),
    pkg.discountType as "PERCENT" | "FIXED",
    pkg.discountValue,
  );
  const split = proportionalDiscountedPrices(
    cores.map((c) => toKopeks(c.service.effectivePrice)),
    finalTotal,
  );

  const shouldAutoConfirm = cores[0]?.shouldAutoConfirm ?? false;

  // 4. Pre-tx conflict check (matches createBooking's belt-and-suspenders).
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
    result = await prisma.$transaction(
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
          // In-tx conflict re-check (Serializable snapshot) per component.
          await ensureNoConflicts(tx, {
            providerId: pkg.providerId,
            masterProviderId: core.resolvedMasterProviderId,
            startAtUtc: core.startAtUtc,
            endAtUtc: core.endAtUtc,
            bufferMin: core.bufferMin,
          });

          const created = await tx.booking.create({
            data: {
              providerId: pkg.providerId,
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
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    const conflict = mapPrismaBookingConflict(error);
    if (conflict) throw conflict;
    throw error;
  }

  // Post-tx slot-cache invalidation per child (best-effort, non-fatal).
  for (const core of cores) {
    try {
      await invalidateSlotsForBookingRange({
        providerId: pkg.providerId,
        masterProviderId: core.resolvedMasterProviderId,
        startAtUtc: core.startAtUtc,
        endAtUtc: core.endAtUtc,
      });
    } catch (error) {
      logError("package booking slot invalidation failed", {
        bookingPackageId: result.bookingPackageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

export type CancelSoloPackageResult = {
  bookingPackageId: string;
  status: BookingPackageStatus;
  cancelledBookingIds: string[];
};

/**
 * Cancel-whole (atomic). Cancels every still-live child + flips the package
 * to CANCELLED in ONE transaction. A partially-cancelled package is a broken
 * state, so this is all-or-none. Children keep `bookingPackageId` (audit
 * trail). For a CLIENT cancel the action-window + cancellation deadline are
 * enforced on the EARLIEST child (you can't cancel the package once its first
 * appointment is inside the cutoff); a MASTER cancel requires a reason.
 */
export async function cancelSoloPackageBooking(input: {
  bookingPackageId: string;
  cancelledBy: BookingCancelledBy;
  reason?: string | null;
}): Promise<CancelSoloPackageResult> {
  const pkg = await prisma.bookingPackage.findUnique({
    where: { id: input.bookingPackageId },
    select: {
      id: true,
      status: true,
      provider: { select: { cancellationDeadlineHours: true } },
      bookings: {
        select: {
          id: true,
          status: true,
          startAtUtc: true,
          endAtUtc: true,
          providerId: true,
          masterProviderId: true,
        },
        orderBy: { startAtUtc: "asc" },
      },
    },
  });

  if (!pkg) throw new AppError("Пакет не найден.", 404, "PACKAGE_NOT_FOUND");
  if (pkg.status === BookingPackageStatus.CANCELLED) {
    throw new AppError("Пакет уже отменён.", 409, "PACKAGE_ALREADY_CANCELLED");
  }

  const liveChildren = pkg.bookings.filter((b) => {
    const runtime = resolveBookingRuntimeStatus({
      status: b.status,
      startAtUtc: b.startAtUtc,
      endAtUtc: b.endAtUtc,
    });
    return runtime !== "REJECTED" && runtime !== "IN_PROGRESS" && runtime !== "FINISHED";
  });

  // Guard on the earliest live child (the whole package shares one cancel
  // decision). If any child already started/finished, the package can't be
  // cleanly cancelled as a unit.
  const startedChild = pkg.bookings.find((b) => {
    const runtime = resolveBookingRuntimeStatus({
      status: b.status,
      startAtUtc: b.startAtUtc,
      endAtUtc: b.endAtUtc,
    });
    return runtime === "IN_PROGRESS" || runtime === "FINISHED";
  });
  if (startedChild) {
    throw new AppError("Часть пакета уже началась — отмена недоступна.", 409, "CONFLICT");
  }

  const earliest = liveChildren[0];
  if (earliest) {
    if (!canCancelOrReschedule(earliest.status)) {
      throw new AppError("Пакет нельзя отменить в текущем состоянии.", 409, "CONFLICT");
    }
    if (input.cancelledBy === BookingCancelledBy.CLIENT) {
      ensureBookingActionWindow(earliest.startAtUtc);
      ensureCancellationDeadline(earliest.startAtUtc, pkg.provider.cancellationDeadlineHours);
    } else {
      const reason = input.reason?.trim() ?? "";
      if (reason.length === 0) {
        throw new AppError("Укажите причину отмены.", 400, "VALIDATION_ERROR");
      }
    }
  }

  const cancelledAt = new Date();
  const cancelledBookingIds = await prisma.$transaction(async (tx) => {
    const ids: string[] = [];
    for (const child of liveChildren) {
      // LOGIC-02: переход только из наблюдённого статуса ребёнка. Статусы
      // прочитаны выше и ВНЕ транзакции, поэтому безусловная запись затирала бы
      // чужой переход по конкретному компоненту. Отказ здесь роняет всю
      // транзакцию — и это правильно: пакет отменяется целиком (инв. #34).
      await applyBookingTransition(tx, {
        id: child.id,
        expectedStatus: child.status,
        select: { id: true },
        data: {
          status: "REJECTED",
          cancelledBy: input.cancelledBy,
          cancelReason: input.reason?.trim() || null,
          cancelledAtUtc: cancelledAt,
          requestedBy: input.cancelledBy === BookingCancelledBy.CLIENT ? "CLIENT" : "MASTER",
          actionRequiredBy: null,
          proposedStartAt: null,
          proposedEndAt: null,
        },
      });
      ids.push(child.id);
    }
    await tx.bookingPackage.update({
      where: { id: pkg.id },
      data: { status: BookingPackageStatus.CANCELLED },
    });
    return ids;
  });

  // Post-tx slot-cache invalidation per cancelled child (best-effort).
  for (const child of liveChildren) {
    try {
      await invalidateSlotsForBookingRange({
        providerId: child.providerId,
        masterProviderId: child.masterProviderId ?? null,
        startAtUtc: child.startAtUtc,
        endAtUtc: child.endAtUtc,
      });
    } catch (error) {
      logError("package cancel slot invalidation failed", {
        bookingPackageId: pkg.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    bookingPackageId: pkg.id,
    status: BookingPackageStatus.CANCELLED,
    cancelledBookingIds,
  };
}
