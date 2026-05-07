import { ScheduleSettingsPage } from "@/features/master/components/schedule-settings/schedule-settings-page";

/**
 * Settings sub-route for the schedule. Replaced the 1488-line legacy
 * `<MasterScheduleEditor>` in 25-SETTINGS-A with a tabs shell where only
 * the "Часы" (Hours) tab is implemented; the four remaining tabs render
 * placeholders. The legacy editor lives on for the studio-cabinet calendar
 * until that flow gets its own rebuild.
 */
export default async function MasterScheduleSettingsRoute() {
  return <ScheduleSettingsPage />;
}
