vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/redis/connection", () => ({ getRedisConnection: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn() }));

import {
  buildBookingConfirmedBody,
  buildBookingDeclinedBody,
  buildBookingRequestBody,
} from "@/lib/notifications/service";

describe("notifications/booking-notifications", () => {
  const snapshot = {
    id: "booking-1",
    status: "PENDING",
    clientUserId: "user-1",
    clientName: "Anna",
    startAtUtc: new Date("2026-02-07T10:30:00Z"),
    studioId: null,
    provider: {
      id: "provider-1",
      type: "MASTER",
      name: "Master",
      timezone: "UTC",
      ownerUserId: "owner-1",
      masterProfile: { userId: "owner-1" },
    },
    masterProvider: null,
    service: {
      id: "service-1",
      name: "Manicure",
      title: "Manicure",
    },
  };

  it("booking request body includes client and service", () => {
    const body = buildBookingRequestBody(snapshot as never);
    expect(body).toContain("Anna");
    expect(body).toContain("Manicure");
  });

  it("booking confirmed body for client includes confirmation text", () => {
    const body = buildBookingConfirmedBody(snapshot as never, "CLIENT", "MANUAL");
    expect(body.toLowerCase()).toContain("подтверждена");
  });

  it("booking declined body includes declined text", () => {
    const body = buildBookingDeclinedBody(snapshot as never);
    expect(body.toLowerCase()).toContain("отклонена");
  });
});
