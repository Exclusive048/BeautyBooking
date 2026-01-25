export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type WeeklyScheduleItem = {
  dayOfWeek: DayOfWeek;
  startLocal: string; // HH:mm
  endLocal: string; // HH:mm
};

export type ScheduleOverride = {
  date: Date;
  isDayOff: boolean;
  startLocal?: string | null;
  endLocal?: string | null;
};

export type ScheduleBlock = {
  date: Date;
  startLocal: string;
  endLocal: string;
  reason?: string | null;
};

export type AvailabilitySlot = {
  startAtUtc: Date;
  endAtUtc: Date;
  label: string;
};
