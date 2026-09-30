import { ScheduleChangeRequestStatus } from "@prisma/client";
import { logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { buildScheduleRequestReview } from "@/lib/schedule/change-requests";
import type { ScheduleRequestReview } from "@/lib/schedule/schedule-changes-shared";

export type ScheduleRequestListItem = {
  id: string;
  status: ScheduleChangeRequestStatus;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  provider: {
    id: string;
    name: string;
  };
  /** Raw payload — passed to client preview helper. */
  payload: unknown;
  /**
   * Открытая заявка: график сейчас и дни «было → стало» (SCHEDULE-STUDIO-PROFILE-CALENDAR).
   * У решённых и у старых заявок недели — `null`.
   */
  review: ScheduleRequestReview | null;
};

export type ScheduleRequestLists = {
  pending: ScheduleRequestListItem[];
  resolved: ScheduleRequestListItem[];
};

const RESOLVED_LIMIT = 20;

export async function listScheduleRequestsForStudio(studioId: string): Promise<ScheduleRequestLists> {
  const [pending, resolved] = await Promise.all([
    prisma.scheduleChangeRequest.findMany({
      where: { studioId, status: ScheduleChangeRequestStatus.PENDING },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        comment: true,
        createdAt: true,
        updatedAt: true,
        payloadJson: true,
        provider: { select: { id: true, name: true } },
      },
    }),
    prisma.scheduleChangeRequest.findMany({
      where: {
        studioId,
        status: { in: [ScheduleChangeRequestStatus.APPROVED, ScheduleChangeRequestStatus.REJECTED] },
      },
      orderBy: { updatedAt: "desc" },
      take: RESOLVED_LIMIT,
      select: {
        id: true,
        status: true,
        comment: true,
        createdAt: true,
        updatedAt: true,
        payloadJson: true,
        provider: { select: { id: true, name: true } },
      },
    }),
  ]);

  const toItem = (row: (typeof pending)[number], review: ScheduleRequestReview | null): ScheduleRequestListItem => ({
    id: row.id,
    status: row.status,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    provider: { id: row.provider.id, name: row.provider.name },
    payload: row.payloadJson,
    review,
  });

  // «Было → стало» считается движком по каждой открытой заявке; сбой одной не
  // роняет страницу — карточка просто покажет тело заявки.
  const reviews = await Promise.all(
    pending.map((row) =>
      buildScheduleRequestReview(row.provider.id, row.payloadJson).catch((error: unknown) => {
        logError("schedule request review failed", {
          scheduleRequestId: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }),
    ),
  );

  return {
    pending: pending.map((row, index) => toItem(row, reviews[index] ?? null)),
    resolved: resolved.map((row) => toItem(row, null)),
  };
}

export async function countPendingScheduleRequests(studioId: string): Promise<number> {
  return prisma.scheduleChangeRequest.count({
    where: { studioId, status: ScheduleChangeRequestStatus.PENDING },
  });
}
