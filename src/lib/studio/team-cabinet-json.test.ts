import { describe, expect, it } from "vitest";
import type {
  StudioMasterDetail,
  StudioMasterListItem,
} from "@/features/studio-cabinet/masters/server/types";
import {
  buildStudioMasterServicesMatrix,
  studioMasterActions,
  toStudioMasterDetailJson,
  toStudioMasterListItemJson,
} from "@/lib/studio/team-cabinet-json";

/** MOBILE-STUDIO-C (team) — форма чтений команды студии для приложения. */

const ITEM: StudioMasterListItem = {
  id: "m-1",
  providerId: "m-1",
  urlHandle: "anna",
  userId: "u-2",
  displayName: "Анна",
  avatarUrl: null,
  servicesSummary: "Маникюр",
  status: "ACTIVE",
  isCurrentUser: true,
  metrics: { revenue30dKopeks: 0, bookings30d: 0, occupancy30dPercent: 0, rating: 0, reviewsCount: 0 },
};

const DETAIL: StudioMasterDetail = {
  ...ITEM,
  phone: "+79990000001",
  email: null,
  joinedAt: "2026-09-01T07:00:00.000Z",
  publicProfileUrl: "https://example.com/u/anna",
  clientsCount: 1,
  averageCheckKopeks: 100_000,
  weekSchedule: [],
  viewToken: "token",
  profile: { name: "Анна", tagline: "Маникюр", description: "" },
  blockingStudioBookings: 0,
};

describe("studioMasterActions", () => {
  it("pauses a working master and returns a paused one", () => {
    expect(studioMasterActions({ status: "ACTIVE", userId: "u" })).toEqual({
      pause: true,
      activate: false,
      remove: true,
      revokeInvite: false,
      resendInvite: false,
      editSchedule: true,
    });
    expect(studioMasterActions({ status: "DISABLED", userId: "u" })).toEqual({
      pause: false,
      activate: true,
      remove: true,
      revokeInvite: false,
      resendInvite: false,
      editSchedule: true,
    });
  });

  it("only revokes or resends the invite of a master without an account", () => {
    expect(studioMasterActions({ status: "INVITED", userId: null })).toEqual({
      pause: false,
      activate: false,
      remove: false,
      revokeInvite: true,
      resendInvite: true,
      editSchedule: false,
    });
    expect(studioMasterActions({ status: "INVITED", userId: "u" })).toMatchObject({
      remove: false,
      revokeInvite: false,
      resendInvite: false,
    });
  });
});

describe("master json", () => {
  it("drops the web handle from a list item", () => {
    const json = toStudioMasterListItemJson(ITEM);

    expect(json).toEqual({
      id: "m-1",
      userId: "u-2",
      displayName: "Анна",
      avatarUrl: null,
      servicesSummary: "Маникюр",
      status: "ACTIVE",
      isCurrentUser: true,
      metrics: ITEM.metrics,
    });
  });

  it("drops the web token and link from the card and adds actions", () => {
    const json = toStudioMasterDetailJson(DETAIL);

    expect(json).not.toHaveProperty("viewToken");
    expect(json).not.toHaveProperty("publicProfileUrl");
    expect(json).not.toHaveProperty("urlHandle");
    expect(json).toMatchObject({
      phone: "+79990000001",
      email: null,
      averageCheckKopeks: 100_000,
      profile: DETAIL.profile,
      actions: { pause: true, editSchedule: true },
    });
  });
});

describe("buildStudioMasterServicesMatrix", () => {
  const services = [
    {
      id: "s-1",
      name: "manicure",
      title: "Маникюр",
      isActive: true,
      price: 150_000,
      basePrice: 200_000,
      durationMin: 45,
      baseDurationMin: 60,
    },
    {
      id: "s-2",
      name: "Педикюр",
      title: "  ",
      isActive: false,
      price: 300_000,
      basePrice: null,
      durationMin: 90,
      baseDurationMin: null,
    },
  ];

  it("lists every studio service in catalog order with the master's own values", () => {
    const rows = buildStudioMasterServicesMatrix(services, [
      { serviceId: "s-1", isEnabled: true, priceOverride: 250_000, durationOverrideMin: null, commissionPct: 30 },
    ]);

    expect(rows).toEqual([
      {
        serviceId: "s-1",
        title: "Маникюр",
        isActive: true,
        basePriceKopeks: 200_000,
        baseDurationMin: 60,
        isEnabled: true,
        priceOverrideKopeks: 250_000,
        durationOverrideMin: null,
        commissionPct: 30,
        effectivePriceKopeks: 250_000,
        effectiveDurationMin: 60,
      },
      {
        serviceId: "s-2",
        title: "Педикюр",
        isActive: false,
        basePriceKopeks: 300_000,
        baseDurationMin: 90,
        isEnabled: false,
        priceOverrideKopeks: null,
        durationOverrideMin: null,
        commissionPct: null,
        effectivePriceKopeks: 300_000,
        effectiveDurationMin: 90,
      },
    ]);
  });

  it("keeps a disabled row's own price", () => {
    const [row] = buildStudioMasterServicesMatrix(services.slice(0, 1), [
      { serviceId: "s-1", isEnabled: false, priceOverride: null, durationOverrideMin: 75, commissionPct: null },
    ]);

    expect(row).toMatchObject({ isEnabled: false, durationOverrideMin: 75, effectiveDurationMin: 75 });
  });

  it("ignores rows of services outside the studio", () => {
    const rows = buildStudioMasterServicesMatrix(services.slice(0, 1), [
      { serviceId: "other", isEnabled: true, priceOverride: 1, durationOverrideMin: 1, commissionPct: 1 },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ serviceId: "s-1", isEnabled: false, priceOverrideKopeks: null });
  });
});
