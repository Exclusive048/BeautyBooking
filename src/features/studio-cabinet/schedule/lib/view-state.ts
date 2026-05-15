export type StudioScheduleView = "day" | "week";

export function parseScheduleView(value: unknown): StudioScheduleView {
  return value === "week" ? "week" : "day";
}
