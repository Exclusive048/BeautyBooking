import test from "node:test";
import assert from "node:assert/strict";
import { ProviderType } from "@prisma/client";
import {
  buildBookingConfirmedBody,
  buildBookingDeclinedBody,
  buildBookingRequestBody,
  type BookingNotificationSnapshot,
} from "@/lib/notifications/service";

const snapshot: BookingNotificationSnapshot = {
  id: "booking-1",
  status: "PENDING",
  clientUserId: "user-1",
  clientName: "Анна",
  startAtUtc: new Date("2026-02-07T10:30:00Z"),
  studioId: null,
  provider: {
    id: "provider-1",
    type: ProviderType.MASTER,
    name: "Master",
    timezone: "UTC",
    ownerUserId: "owner-1",
    masterProfile: { userId: "owner-1" },
  },
  masterProvider: null,
  service: {
    id: "service-1",
    name: "Маникюр",
    title: "Маникюр",
  },
};

test("booking request body includes client and service", () => {
  const body = buildBookingRequestBody(snapshot);
  assert.ok(body.includes(snapshot.clientName));
  assert.ok(body.includes("Маникюр"));
});

test("booking confirmed body for client includes confirmation text", () => {
  const body = buildBookingConfirmedBody(snapshot, "CLIENT", "MANUAL");
  assert.ok(body.includes("Ваша запись подтверждена"));
});

test("booking declined body includes declined text", () => {
  const body = buildBookingDeclinedBody(snapshot);
  assert.ok(body.toLowerCase().includes("отклон"));
});
