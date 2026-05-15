import { ScheduleChangeRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

  const toItem = (row: (typeof pending)[number]): ScheduleRequestListItem => ({
    id: row.id,
    status: row.status,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    provider: { id: row.provider.id, name: row.provider.name },
    payload: row.payloadJson,
  });

  return {
    pending: pending.map(toItem),
    resolved: resolved.map(toItem),
  };
}

export async function countPendingScheduleRequests(studioId: string): Promise<number> {
  return prisma.scheduleChangeRequest.count({
    where: { studioId, status: ScheduleChangeRequestStatus.PENDING },
  });
}
