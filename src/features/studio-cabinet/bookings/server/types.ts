import type { BookingSource, BookingStatus } from "@prisma/client";

export type StudioBookingRow = {
  id: string;
  startAtUtc: string;
  endAtUtc: string;
  master: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    specialization: string;
  };
  client: {
    displayName: string;
    phone: string | null;
    isNewClient: boolean;
    isVip: boolean;
  };
  service: {
    name: string;
    durationMin: number;
  };
  priceKopeks: number;
  source: BookingSource;
  status: BookingStatus;
};

export type StudioBookingsRangeCounts = {
  today: number;
  tomorrow: number;
  week: number;
  all: number;
};

export type StudioBookingsListData = {
  items: StudioBookingRow[];
  nextCursor: string | null;
  rangeCounts: StudioBookingsRangeCounts;
};

export type StudioBookingsKpis = {
  todayCount: number;
  todayCompleted: number;
  todayUpcoming: number;
  needsActionCount: number;
  confirmedNext7Days: number;
  revenueTodayKopeks: number;
  revenueDeltaPercent: number | null;
  noShowLast7Days: number;
};

export type MasterOption = {
  id: string;
  name: string;
};
