import test from "node:test";
import assert from "node:assert/strict";
import { BookingStatus, ChatSenderType } from "@prisma/client";
import { resolveChatAccessForBooking } from "@/lib/chat/access";

const baseBooking = {
  id: "b1",
  status: BookingStatus.CONFIRMED,
  startAtUtc: new Date(),
  clientUserId: "client-1",
  masterProvider: {
    ownerUserId: "master-1",
    name: "Master",
  },
};

test("resolveChatAccessForBooking allows client", () => {
  const result = resolveChatAccessForBooking(baseBooking, "client-1");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.senderType, ChatSenderType.CLIENT);
  }
});

test("resolveChatAccessForBooking allows master", () => {
  const result = resolveChatAccessForBooking(baseBooking, "master-1");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.senderType, ChatSenderType.MASTER);
  }
});

test("resolveChatAccessForBooking denies studio admin user", () => {
  const result = resolveChatAccessForBooking(baseBooking, "studio-admin-1");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "forbidden");
  }
});

test("resolveChatAccessForBooking denies unrelated user", () => {
  const result = resolveChatAccessForBooking(baseBooking, "random-user");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "forbidden");
  }
});
