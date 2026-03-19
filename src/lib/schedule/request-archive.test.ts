import { describe, it, expect, beforeEach, vi } from "vitest";
import { ScheduleChangeRequestStatus } from "@prisma/client";

const scheduleChangeRequestFindUnique = vi.hoisted(() => vi.fn());
const scheduleChangeRequestFindMany = vi.hoisted(() => vi.fn());
const scheduleChangeRequestArchiveUpsert = vi.hoisted(() => vi.fn());
const scheduleChangeRequestArchiveFindMany = vi.hoisted(() => vi.fn());
const scheduleChangeRequestArchiveGroupBy = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    scheduleChangeRequest: {
      findUnique: scheduleChangeRequestFindUnique,
      findMany: scheduleChangeRequestFindMany,
    },
    scheduleChangeRequestArchive: {
      upsert: scheduleChangeRequestArchiveUpsert,
      findMany: scheduleChangeRequestArchiveFindMany,
      groupBy: scheduleChangeRequestArchiveGroupBy,
    },
  },
}));

import {
  archiveFinalizedScheduleChangeRequestsForStudio,
  archiveScheduleChangeRequestById,
  buildScheduleRequestStatusHistory,
  getScheduleChangeRequestArchiveReport,
  getScheduleChangeRequestArchiveStatusCounts,
} from "@/lib/schedule/request-archive";

function makeFinalRequest(status: "APPROVED" | "REJECTED") {
  return {
    id: "req-1",
    studioId: "studio-1",
    providerId: "provider-1",
    status,
    createdAt: new Date("2026-03-10T10:00:00.000Z"),
    updatedAt: new Date("2026-03-11T12:30:00.000Z"),
    payloadJson: { month: "2026-03" },
    comment: status === "REJECTED" ? "Need changes" : null,
    provider: { id: "provider-1", name: "Master One" },
    studio: {
      id: "studio-1",
      provider: { id: "studio-provider-1", name: "Studio One" },
    },
  };
}

describe("schedule/request-archive", () => {
  beforeEach(() => {
    scheduleChangeRequestFindUnique.mockReset();
    scheduleChangeRequestFindMany.mockReset();
    scheduleChangeRequestArchiveUpsert.mockReset();
    scheduleChangeRequestArchiveFindMany.mockReset();
    scheduleChangeRequestArchiveGroupBy.mockReset();
  });

  it("creates archive entry for finalized request", async () => {
    scheduleChangeRequestFindUnique.mockResolvedValueOnce(makeFinalRequest("APPROVED"));
    scheduleChangeRequestArchiveUpsert.mockResolvedValueOnce({ id: "archive-1" });

    const result = await archiveScheduleChangeRequestById("req-1");

    expect(result).toEqual({ archived: true, archiveId: "archive-1" });
    expect(scheduleChangeRequestArchiveUpsert).toHaveBeenCalledTimes(1);
    expect(scheduleChangeRequestArchiveUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sourceRequestId: "req-1" },
        create: expect.objectContaining({
          sourceRequestId: "req-1",
          studioId: "studio-1",
          providerId: "provider-1",
          finalStatus: "APPROVED",
        }),
      })
    );
  });

  it("does not archive non-final request and keeps live flow unchanged", async () => {
    scheduleChangeRequestFindUnique.mockResolvedValueOnce({
      ...makeFinalRequest("APPROVED"),
      status: "PENDING",
    });

    const result = await archiveScheduleChangeRequestById("req-1");

    expect(result).toEqual({ archived: false, archiveId: null });
    expect(scheduleChangeRequestArchiveUpsert).not.toHaveBeenCalled();
  });

  it("is idempotent for repeated archive runs of the same request", async () => {
    scheduleChangeRequestFindUnique.mockResolvedValue(makeFinalRequest("REJECTED"));
    scheduleChangeRequestArchiveUpsert.mockResolvedValue({ id: "archive-1" });

    await archiveScheduleChangeRequestById("req-1");
    await archiveScheduleChangeRequestById("req-1");

    expect(scheduleChangeRequestArchiveUpsert).toHaveBeenCalledTimes(2);
    expect(scheduleChangeRequestArchiveUpsert.mock.calls[0]?.[0]?.where).toEqual({
      sourceRequestId: "req-1",
    });
    expect(scheduleChangeRequestArchiveUpsert.mock.calls[1]?.[0]?.where).toEqual({
      sourceRequestId: "req-1",
    });
  });

  it("builds status history with transition timestamps", () => {
    const history = buildScheduleRequestStatusHistory({
      status: ScheduleChangeRequestStatus.REJECTED,
      createdAt: new Date("2026-03-10T10:00:00.000Z"),
      updatedAt: new Date("2026-03-11T12:30:00.000Z"),
    });

    expect(history).toEqual([
      { status: "PENDING", changedAt: "2026-03-10T10:00:00.000Z" },
      { status: "REJECTED", changedAt: "2026-03-11T12:30:00.000Z" },
    ]);
  });

  it("builds archive report for selected period with tenant filter", async () => {
    const from = new Date("2026-03-01T00:00:00.000Z");
    const toExclusive = new Date("2026-04-01T00:00:00.000Z");
    scheduleChangeRequestArchiveFindMany.mockResolvedValueOnce([
      {
        id: "archive-1",
        sourceRequestId: "req-1",
        studioId: "studio-1",
        providerId: "provider-1",
        createdAt: new Date("2026-03-10T10:00:00.000Z"),
        finalizedAt: new Date("2026-03-11T12:30:00.000Z"),
        finalStatus: "APPROVED",
        statusHistoryJson: [
          { status: "PENDING", changedAt: "2026-03-10T10:00:00.000Z" },
          { status: "APPROVED", changedAt: "2026-03-11T12:30:00.000Z" },
        ],
        payloadJson: { month: "2026-03" },
        comment: null,
        sourceSnapshotJson: {
          providerName: "Master One",
          studioName: "Studio One",
        },
        archivedAt: new Date("2026-03-11T12:31:00.000Z"),
      },
    ]);

    const rows = await getScheduleChangeRequestArchiveReport({
      studioId: "studio-1",
      finalizedFrom: from,
      finalizedToExclusive: toExclusive,
    });

    expect(scheduleChangeRequestArchiveFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studioId: "studio-1",
          finalizedAt: {
            gte: from,
            lt: toExclusive,
          },
        }),
      })
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        sourceRequestId: "req-1",
        finalStatus: "APPROVED",
        providerName: "Master One",
      })
    );
  });

  it("aggregates analytics by status for selected period", async () => {
    const from = new Date("2026-03-01T00:00:00.000Z");
    const toExclusive = new Date("2026-04-01T00:00:00.000Z");
    scheduleChangeRequestArchiveGroupBy.mockResolvedValueOnce([
      { finalStatus: "APPROVED", _count: { _all: 3 } },
      { finalStatus: "REJECTED", _count: { _all: 2 } },
    ]);

    const rows = await getScheduleChangeRequestArchiveStatusCounts({
      studioId: "studio-1",
      finalizedFrom: from,
      finalizedToExclusive: toExclusive,
    });

    expect(scheduleChangeRequestArchiveGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studioId: "studio-1",
          finalizedAt: {
            gte: from,
            lt: toExclusive,
          },
        }),
      })
    );
    expect(rows).toEqual([
      { status: "APPROVED", count: 3 },
      { status: "REJECTED", count: 2 },
    ]);
  });

  it("backfills finalized requests for studio and upserts archive records", async () => {
    scheduleChangeRequestFindMany.mockResolvedValueOnce([
      makeFinalRequest("APPROVED"),
      { ...makeFinalRequest("REJECTED"), id: "req-2" },
    ]);
    scheduleChangeRequestArchiveUpsert.mockResolvedValue({ id: "archive-any" });

    const result = await archiveFinalizedScheduleChangeRequestsForStudio({
      studioId: "studio-1",
      finalizedFrom: new Date("2026-03-01T00:00:00.000Z"),
      finalizedToExclusive: new Date("2026-04-01T00:00:00.000Z"),
      limit: 100,
    });

    expect(scheduleChangeRequestFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studioId: "studio-1",
          status: {
            in: ["APPROVED", "REJECTED"],
          },
        }),
      })
    );
    expect(scheduleChangeRequestArchiveUpsert).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ scannedCount: 2, archivedCount: 2 });
  });
});
