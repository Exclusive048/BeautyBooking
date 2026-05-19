import { describe, it, expect } from "vitest";
import {
  CREATE_BOOKING_IDEMPOTENCY_TTL_SECONDS,
  buildCreateBookingIdempotencyKey,
} from "@/lib/bookings/idempotency";

describe("bookings/idempotency — buildCreateBookingIdempotencyKey", () => {
  it("composes user and request id into a redis-style namespaced key", () => {
    expect(buildCreateBookingIdempotencyKey("u_42", "req_abc")).toBe(
      "idempotency:createBooking:u_42:req_abc",
    );
  });

  it("is deterministic for the same inputs", () => {
    expect(buildCreateBookingIdempotencyKey("u_1", "r_1")).toEqual(
      buildCreateBookingIdempotencyKey("u_1", "r_1"),
    );
  });

  it("produces distinct keys for different users", () => {
    expect(buildCreateBookingIdempotencyKey("u_1", "r_x")).not.toEqual(
      buildCreateBookingIdempotencyKey("u_2", "r_x"),
    );
  });

  it("produces distinct keys for different request ids", () => {
    expect(buildCreateBookingIdempotencyKey("u_1", "r_a")).not.toEqual(
      buildCreateBookingIdempotencyKey("u_1", "r_b"),
    );
  });

  it("accepts the guest namespace (createBooking uses 'guest:<phone>' as userId)", () => {
    // BOOKING-WIDGET-FOUNDATION-A: guests use phone-namespaced key
    expect(buildCreateBookingIdempotencyKey("guest:+79001234567", "req_42")).toBe(
      "idempotency:createBooking:guest:+79001234567:req_42",
    );
  });
});

describe("bookings/idempotency — TTL constant", () => {
  it("uses 600 seconds (10 minutes) — short enough to clear stale locks, long enough for retries", () => {
    expect(CREATE_BOOKING_IDEMPOTENCY_TTL_SECONDS).toBe(600);
  });
});
