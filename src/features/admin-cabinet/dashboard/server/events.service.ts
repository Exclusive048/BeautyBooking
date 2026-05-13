import "server-only";

import {
  AccountType,
  BookingStatus,
  SubscriptionStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";
import { UI_TEXT } from "@/lib/ui/text";
import {
  formatRublesFromKopeks,
  maskLastName,
} from "@/features/admin-cabinet/dashboard/server/shared";
import type {
  AdminEventItem,
  AdminEventsResponse,
} from "@/features/admin-cabinet/dashboard/types";

const T = UI_TEXT.adminPanel.dashboard.feed;

const PRO_ROLES = new Set<AccountType>([
  AccountType.MASTER,
  AccountType.STUDIO,
  AccountType.STUDIO_ADMIN,
]);

type FetchOpts = {
  /** Hard cap on returned items after merge. Default 30. */
  limit?: number;
  /** Only return events newer than this unix-ms timestamp. Used for
   * incremental polling — the client passes the largest `timeMs` it
   * has seen, the server returns just what came after. */
  sinceMs?: number;
};

const MAX_PER_SOURCE = 20;

/** Union query that pulls the latest events from every source the
 * dashboard cares about, merges by timestamp, and trims to `limit`.
 * Each individual query is bounded by `MAX_PER_SOURCE` so even on a
 * busy day we never load thousands of rows just to throw most away. */
export async function getAdminEvents(
  opts: FetchOpts = {},
): Promise<AdminEventsResponse> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const sinceDate = opts.sinceMs ? new Date(opts.sinceMs) : null;

  const [bookings, cancellations, newUsers, subscriptions, complaints] =
    await Promise.all([
      // New bookings (excludes cancellations — they get their own bucket).
      prisma.booking.findMany({
        where: {
          createdAt: sinceDate ? { gt: sinceDate } : undefined,
          status: {
            in: [
              BookingStatus.NEW,
              BookingStatus.PENDING,
              BookingStatus.CONFIRMED,
              BookingStatus.PREPAID,
            ],
          },
        },
        orderBy: { createdAt: "desc" },
        take: MAX_PER_SOURCE,
        select: {
          id: true,
          createdAt: true,
          clientNameSnapshot: true,
          clientName: true,
          provider: { select: { name: true } },
          service: { select: { name: true, price: true } },
        },
      }),
      // Cancellations — keyed off `cancelledAtUtc` rather than `createdAt`
      // so a booking cancelled hours after creation surfaces at the
      // right time.
      prisma.booking.findMany({
        where: {
          cancelledAtUtc: sinceDate
            ? { gt: sinceDate }
            : { not: null },
          status: {
            in: [BookingStatus.CANCELLED, BookingStatus.REJECTED],
          },
        },
        orderBy: { cancelledAtUtc: "desc" },
        take: MAX_PER_SOURCE,
        select: {
          id: true,
          cancelledAtUtc: true,
          service: { select: { name: true, price: true } },
        },
      }),
      // New user registrations — split into master/client by roles.
      prisma.userProfile.findMany({
        where: {
          createdAt: sinceDate ? { gt: sinceDate } : undefined,
          isDeleted: false,
        },
        orderBy: { createdAt: "desc" },
        take: MAX_PER_SOURCE,
        select: {
          id: true,
          createdAt: true,
          displayName: true,
          firstName: true,
          lastName: true,
          roles: true,
          address: true,
        },
      }),
      // Paid subscriptions (only non-FREE plans).
      prisma.userSubscription.findMany({
        where: {
          status: SubscriptionStatus.ACTIVE,
          startedAt: sinceDate ? { gt: sinceDate } : undefined,
          plan: { code: { notIn: ["MASTER_FREE", "STUDIO_FREE"] } },
        },
        orderBy: { startedAt: "desc" },
        take: MAX_PER_SOURCE,
        select: {
          id: true,
          startedAt: true,
          plan: { select: { name: true } },
          user: { select: { displayName: true, firstName: true, lastName: true } },
          payments: {
            orderBy: { createdAt: "desc" },
            take: 1,
            where: { status: "SUCCEEDED" },
            select: { amountKopeks: true, periodMonths: true },
          },
        },
      }),
      // Reported reviews. Note: schema has `reportedAt` but no
      // "moderation handled" flag — we count `reportedAt != null` as
      // "open complaint" until that's modelled.
      prisma.review.findMany({
        where: {
          reportedAt: sinceDate ? { gt: sinceDate } : { not: null },
          ...ACTIVE_REVIEW_FILTER,
        },
        orderBy: { reportedAt: "desc" },
        take: MAX_PER_SOURCE,
        select: { id: true, reportedAt: true },
      }),
    ]);

  const merged: AdminEventItem[] = [];

  for (const b of bookings) {
    const providerName = b.provider?.name ?? "—";
    const clientFull = b.clientNameSnapshot ?? b.clientName ?? null;
    const priceKopeks = b.service?.price ?? null;
    merged.push({
      id: `booking:${b.id}`,
      type: "booking",
      timeIso: b.createdAt.toISOString(),
      timeMs: b.createdAt.getTime(),
      primary: `${maskLastName(providerName)} → ${maskLastName(clientFull)}`,
      secondary: b.service?.name ?? "—",
      amountText: priceKopeks ? formatRublesFromKopeks(priceKopeks) : null,
      amountTone: "neutral",
      dotTone: "ok",
    });
  }

  for (const c of cancellations) {
    if (!c.cancelledAtUtc) continue;
    const priceKopeks = c.service?.price ?? null;
    merged.push({
      id: `booking_cancel:${c.id}`,
      type: "booking_cancel",
      timeIso: c.cancelledAtUtc.toISOString(),
      timeMs: c.cancelledAtUtc.getTime(),
      primary: T.eventTypes.bookingCancel,
      secondary: c.service?.name ?? "—",
      amountText: priceKopeks
        ? `${T.cancelPrefix}${formatRublesFromKopeks(priceKopeks)}`
        : null,
      amountTone: "negative",
      dotTone: "cancel",
    });
  }

  for (const u of newUsers) {
    const isPro = u.roles.some((r) => PRO_ROLES.has(r));
    const fullName = u.displayName
      ?? [u.firstName, u.lastName].filter(Boolean).join(" ")
      ?? "—";
    merged.push({
      id: `registration:${u.id}`,
      type: isPro ? "registration_master" : "registration_client",
      timeIso: u.createdAt.toISOString(),
      timeMs: u.createdAt.getTime(),
      primary: isPro
        ? T.eventTypes.registrationMaster
        : T.eventTypes.registrationClient,
      secondary: maskLastName(fullName),
      amountText: u.address?.trim() ? u.address.trim() : null,
      amountTone: "neutral",
      dotTone: "new",
    });
  }

  for (const s of subscriptions) {
    const fullName =
      s.user.displayName
      ?? [s.user.firstName, s.user.lastName].filter(Boolean).join(" ")
      ?? "—";
    const lastPayment = s.payments[0];
    const monthly =
      lastPayment && lastPayment.periodMonths > 0
        ? lastPayment.amountKopeks / lastPayment.periodMonths
        : null;
    merged.push({
      id: `subscription:${s.id}`,
      type: "subscription",
      timeIso: s.startedAt.toISOString(),
      timeMs: s.startedAt.getTime(),
      primary: `${T.eventTypes.subscription} ${s.plan.name}`,
      secondary: maskLastName(fullName),
      amountText:
        monthly !== null
          ? `${formatRublesFromKopeks(monthly)}${T.perMonthSuffix}`
          : null,
      amountTone: "positive",
      dotTone: "sub",
    });
  }

  for (const r of complaints) {
    if (!r.reportedAt) continue;
    merged.push({
      id: `complaint:${r.id}`,
      type: "complaint",
      timeIso: r.reportedAt.toISOString(),
      timeMs: r.reportedAt.getTime(),
      primary: T.eventTypes.complaint,
      secondary: `#REV-${r.id.slice(-4).toUpperCase()}`,
      amountText: T.complaintOpenLabel,
      amountTone: "negative",
      dotTone: "alert",
    });
  }

  merged.sort((a, b) => b.timeMs - a.timeMs);
  return { items: merged.slice(0, limit) };
}
