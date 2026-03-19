import { Prisma, ScheduleChangeRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const FINAL_SCHEDULE_REQUEST_ARCHIVE_STATUSES = [
  ScheduleChangeRequestStatus.APPROVED,
  ScheduleChangeRequestStatus.REJECTED,
] as const;

export type FinalScheduleRequestArchiveStatus =
  (typeof FINAL_SCHEDULE_REQUEST_ARCHIVE_STATUSES)[number];

export type ScheduleRequestStatusHistoryEntry = {
  status: ScheduleChangeRequestStatus;
  changedAt: string;
};

type ArchiveDbClient = Prisma.TransactionClient | typeof prisma;

type ScheduleRequestArchiveSource = {
  id: string;
  studioId: string | null;
  providerId: string;
  status: ScheduleChangeRequestStatus;
  createdAt: Date;
  updatedAt: Date;
  payloadJson: Prisma.JsonValue;
  comment: string | null;
  provider: { id: string; name: string };
  studio: { id: string; provider: { id: string; name: string } } | null;
};

type ScheduleRequestArchiveRow = {
  id: string;
  sourceRequestId: string;
  studioId: string | null;
  providerId: string;
  createdAt: Date;
  finalizedAt: Date;
  finalStatus: ScheduleChangeRequestStatus;
  statusHistoryJson: Prisma.JsonValue;
  payloadJson: Prisma.JsonValue;
  comment: string | null;
  sourceSnapshotJson: Prisma.JsonValue | null;
  archivedAt: Date;
};

function toIsoString(value: Date): string {
  return value.toISOString();
}

export function isFinalScheduleRequestStatus(
  status: ScheduleChangeRequestStatus
): status is FinalScheduleRequestArchiveStatus {
  return FINAL_SCHEDULE_REQUEST_ARCHIVE_STATUSES.includes(
    status as FinalScheduleRequestArchiveStatus
  );
}

export function buildScheduleRequestStatusHistory(input: {
  status: ScheduleChangeRequestStatus;
  createdAt: Date;
  updatedAt: Date;
}): ScheduleRequestStatusHistoryEntry[] {
  const history: ScheduleRequestStatusHistoryEntry[] = [
    {
      status: ScheduleChangeRequestStatus.PENDING,
      changedAt: toIsoString(input.createdAt),
    },
  ];

  if (input.status !== ScheduleChangeRequestStatus.PENDING) {
    const finalizedAt =
      input.updatedAt.getTime() >= input.createdAt.getTime() ? input.updatedAt : input.createdAt;
    history.push({
      status: input.status,
      changedAt: toIsoString(finalizedAt),
    });
  }

  return history;
}

function buildSourceSnapshotJson(source: ScheduleRequestArchiveSource): Prisma.InputJsonValue {
  return {
    sourceRequestId: source.id,
    providerId: source.providerId,
    providerName: source.provider.name,
    studioId: source.studioId,
    studioName: source.studio?.provider.name ?? null,
  };
}

function toArchiveUpsertData(source: ScheduleRequestArchiveSource): {
  create: Prisma.ScheduleChangeRequestArchiveCreateInput;
  update: Prisma.ScheduleChangeRequestArchiveUpdateInput;
} {
  const statusHistory = buildScheduleRequestStatusHistory(source) as unknown as Prisma.InputJsonValue;
  const snapshotJson = buildSourceSnapshotJson(source);

  return {
    create: {
      sourceRequestId: source.id,
      studioId: source.studioId,
      providerId: source.providerId,
      createdAt: source.createdAt,
      finalizedAt: source.updatedAt,
      finalStatus: source.status,
      statusHistoryJson: statusHistory,
      payloadJson: source.payloadJson as Prisma.InputJsonValue,
      comment: source.comment,
      sourceSnapshotJson: snapshotJson,
    },
    update: {
      studioId: source.studioId,
      providerId: source.providerId,
      createdAt: source.createdAt,
      finalizedAt: source.updatedAt,
      finalStatus: source.status,
      statusHistoryJson: statusHistory,
      payloadJson: source.payloadJson as Prisma.InputJsonValue,
      comment: source.comment,
      sourceSnapshotJson: snapshotJson,
    },
  };
}

async function upsertScheduleRequestArchive(
  source: ScheduleRequestArchiveSource,
  db: ArchiveDbClient
): Promise<{ id: string }> {
  const { create, update } = toArchiveUpsertData(source);
  return db.scheduleChangeRequestArchive.upsert({
    where: { sourceRequestId: source.id },
    create,
    update,
    select: { id: true },
  });
}

async function loadScheduleRequestArchiveSource(
  requestId: string,
  db: ArchiveDbClient
): Promise<ScheduleRequestArchiveSource | null> {
  return db.scheduleChangeRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      studioId: true,
      providerId: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      payloadJson: true,
      comment: true,
      provider: { select: { id: true, name: true } },
      studio: {
        select: {
          id: true,
          provider: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export async function archiveScheduleChangeRequestById(
  requestId: string,
  db: ArchiveDbClient = prisma
): Promise<{ archived: boolean; archiveId: string | null }> {
  const source = await loadScheduleRequestArchiveSource(requestId, db);
  if (!source) return { archived: false, archiveId: null };
  if (!isFinalScheduleRequestStatus(source.status)) {
    return { archived: false, archiveId: null };
  }

  const archive = await upsertScheduleRequestArchive(source, db);
  return { archived: true, archiveId: archive.id };
}

export async function archiveFinalizedScheduleChangeRequestsForStudio(
  input: {
    studioId: string;
    finalizedFrom?: Date;
    finalizedToExclusive?: Date;
    limit?: number;
  },
  db: ArchiveDbClient = prisma
): Promise<{ scannedCount: number; archivedCount: number }> {
  const updatedAtFilter: Prisma.DateTimeFilter = {};
  if (input.finalizedFrom) updatedAtFilter.gte = input.finalizedFrom;
  if (input.finalizedToExclusive) updatedAtFilter.lt = input.finalizedToExclusive;

  const requests = await db.scheduleChangeRequest.findMany({
    where: {
      studioId: input.studioId,
      status: {
        in: [...FINAL_SCHEDULE_REQUEST_ARCHIVE_STATUSES],
      },
      ...(Object.keys(updatedAtFilter).length > 0 ? { updatedAt: updatedAtFilter } : {}),
    },
    orderBy: { updatedAt: "asc" },
    take: Math.max(1, Math.min(input.limit ?? 1000, 5000)),
    select: {
      id: true,
      studioId: true,
      providerId: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      payloadJson: true,
      comment: true,
      provider: { select: { id: true, name: true } },
      studio: {
        select: {
          id: true,
          provider: { select: { id: true, name: true } },
        },
      },
    },
  });

  let archivedCount = 0;
  for (const request of requests) {
    const archive = await upsertScheduleRequestArchive(request, db);
    if (archive.id) archivedCount += 1;
  }

  return {
    scannedCount: requests.length,
    archivedCount,
  };
}

function parseStatusHistory(
  value: Prisma.JsonValue
): ScheduleRequestStatusHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: ScheduleRequestStatusHistoryEntry[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.status !== "string" || typeof record.changedAt !== "string") continue;
    if (!(record.status in ScheduleChangeRequestStatus)) continue;
    entries.push({
      status: record.status as ScheduleChangeRequestStatus,
      changedAt: record.changedAt,
    });
  }

  return entries;
}

function readSnapshotString(snapshot: Prisma.JsonValue | null, key: string): string | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const value = (snapshot as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function mapArchiveRow(row: ScheduleRequestArchiveRow): ScheduleChangeRequestArchiveReportRow {
  return {
    sourceRequestId: row.sourceRequestId,
    studioId: row.studioId,
    providerId: row.providerId,
    providerName: readSnapshotString(row.sourceSnapshotJson, "providerName"),
    studioName: readSnapshotString(row.sourceSnapshotJson, "studioName"),
    createdAt: row.createdAt.toISOString(),
    finalizedAt: row.finalizedAt.toISOString(),
    finalStatus: row.finalStatus,
    archivedAt: row.archivedAt.toISOString(),
    comment: row.comment,
    statusHistory: parseStatusHistory(row.statusHistoryJson),
    payloadJson: row.payloadJson,
  };
}

export type ScheduleChangeRequestArchiveReportRow = {
  sourceRequestId: string;
  studioId: string | null;
  providerId: string;
  providerName: string | null;
  studioName: string | null;
  createdAt: string;
  finalizedAt: string;
  finalStatus: ScheduleChangeRequestStatus;
  archivedAt: string;
  comment: string | null;
  statusHistory: ScheduleRequestStatusHistoryEntry[];
  payloadJson: Prisma.JsonValue;
};

export async function getScheduleChangeRequestArchiveReport(input: {
  studioId: string;
  finalizedFrom: Date;
  finalizedToExclusive: Date;
}): Promise<ScheduleChangeRequestArchiveReportRow[]> {
  const rows = await prisma.scheduleChangeRequestArchive.findMany({
    where: {
      studioId: input.studioId,
      finalizedAt: {
        gte: input.finalizedFrom,
        lt: input.finalizedToExclusive,
      },
      finalStatus: {
        in: [...FINAL_SCHEDULE_REQUEST_ARCHIVE_STATUSES],
      },
    },
    orderBy: [{ finalizedAt: "desc" }, { sourceRequestId: "desc" }],
    select: {
      id: true,
      sourceRequestId: true,
      studioId: true,
      providerId: true,
      createdAt: true,
      finalizedAt: true,
      finalStatus: true,
      statusHistoryJson: true,
      payloadJson: true,
      comment: true,
      sourceSnapshotJson: true,
      archivedAt: true,
    },
  });

  return rows.map((row) =>
    mapArchiveRow({
      ...row,
      statusHistoryJson: row.statusHistoryJson as Prisma.JsonValue,
      payloadJson: row.payloadJson as Prisma.JsonValue,
      sourceSnapshotJson: row.sourceSnapshotJson as Prisma.JsonValue | null,
    })
  );
}

export type ScheduleChangeRequestArchiveStatusCount = {
  status: FinalScheduleRequestArchiveStatus;
  count: number;
};

export async function getScheduleChangeRequestArchiveStatusCounts(input: {
  studioId: string;
  finalizedFrom: Date;
  finalizedToExclusive: Date;
}): Promise<ScheduleChangeRequestArchiveStatusCount[]> {
  const rows = await prisma.scheduleChangeRequestArchive.groupBy({
    by: ["finalStatus"],
    where: {
      studioId: input.studioId,
      finalizedAt: {
        gte: input.finalizedFrom,
        lt: input.finalizedToExclusive,
      },
      finalStatus: {
        in: [...FINAL_SCHEDULE_REQUEST_ARCHIVE_STATUSES],
      },
    },
    _count: { _all: true },
    orderBy: { finalStatus: "asc" },
  });

  return rows.map((row) => ({
    status: row.finalStatus as FinalScheduleRequestArchiveStatus,
    count: row._count._all,
  }));
}
