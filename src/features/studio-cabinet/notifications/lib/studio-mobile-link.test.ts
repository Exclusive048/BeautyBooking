import { describe, expect, it } from "vitest";
import { studioMobileNotificationLink } from "./studio-mobile-link";

/** MOBILE-STUDIO-C (ops) — пути экранов приложения для уведомлений студии. */

const base = { bookingId: null, bookingStudioId: null, studioId: "s1" };

describe("studioMobileNotificationLink", () => {
  it("запись этой студии открывается карточкой", () => {
    expect(
      studioMobileNotificationLink({ ...base, type: "BOOKING_CREATED", bookingId: "b1", bookingStudioId: "s1" }),
    ).toBe("/studio/bookings/b1");
    expect(
      studioMobileNotificationLink({ ...base, type: "BOOKING_CANCELLED_BY_CLIENT", bookingId: "b1", bookingStudioId: "s1" }),
    ).toBe("/studio/bookings/b1");
  });

  it("запись другой студии или без записи — без перехода", () => {
    expect(
      studioMobileNotificationLink({ ...base, type: "BOOKING_CREATED", bookingId: "b1", bookingStudioId: "s2" }),
    ).toBeNull();
    expect(studioMobileNotificationLink({ ...base, type: "BOOKING_CREATED" })).toBeNull();
  });

  it("заявки на график, команда, отзывы", () => {
    expect(studioMobileNotificationLink({ ...base, type: "SCHEDULE_REQUEST" })).toBe("/studio/schedule-requests");
    expect(studioMobileNotificationLink({ ...base, type: "STUDIO_SCHEDULE_REQUEST" })).toBe("/studio/schedule-requests");
    expect(studioMobileNotificationLink({ ...base, type: "STUDIO_INVITE_ACCEPTED" })).toBe("/studio/team");
    expect(studioMobileNotificationLink({ ...base, type: "STUDIO_MEMBER_LEFT" })).toBe("/studio/team");
    expect(studioMobileNotificationLink({ ...base, type: "STUDIO_SCHEDULE_ENDING" })).toBe("/studio/team");
    expect(studioMobileNotificationLink({ ...base, type: "REVIEW_LEFT", bookingId: "b1", bookingStudioId: "s1" })).toBe(
      "/studio/reviews",
    );
  });

  it("прочее — без перехода", () => {
    expect(studioMobileNotificationLink({ ...base, type: "CHAT_MESSAGE_RECEIVED", bookingId: "b1", bookingStudioId: "s1" })).toBeNull();
    expect(studioMobileNotificationLink({ ...base, type: "BILLING_PAYMENT_FAILED" })).toBeNull();
  });
});
