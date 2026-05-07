import { redirect } from "next/navigation";
import { MasterScheduleEditor } from "@/features/cabinet/master/schedule/master-schedule-editor";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { getSessionUser } from "@/lib/auth/session";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster;

/**
 * Settings sub-route for the schedule. Holds the legacy
 * `<MasterScheduleEditor>` (working hours / breaks / overrides) that used
 * to live at `/cabinet/master/schedule` before the 25a refactor moved
 * the calendar week view to that path. Sidebar nav already points here.
 */
export default async function MasterScheduleSettingsRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <>
      <MasterPageHeader
        breadcrumb={[
          { label: T.pageHeader.breadcrumbHome, href: "/cabinet/master/dashboard" },
          { label: T.schedule.breadcrumb, href: "/cabinet/master/schedule" },
          { label: T.nav.items.scheduleSettings },
        ]}
        title={T.nav.items.scheduleSettings}
        subtitle={T.pageTitles.scheduleSettings.subtitle}
      />

      <div className="space-y-4 px-4 py-6 md:px-6 lg:px-8">
        <MasterScheduleEditor showDayConsole />
      </div>
    </>
  );
}
