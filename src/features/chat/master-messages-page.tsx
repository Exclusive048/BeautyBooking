import { redirect } from "next/navigation";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { ChatShell } from "@/features/chat/chat-shell";
import { getSessionUser } from "@/lib/auth/session";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster;
const C = UI_TEXT.chat;

/** Server entry for `/cabinet/master/messages` (33a). */
export async function MasterMessagesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.roles.includes("MASTER")) redirect("/cabinet");

  return (
    <>
      <MasterPageHeader
        breadcrumb={[
          { label: T.pageHeader.breadcrumbHome, href: "/cabinet/master/dashboard" },
          { label: C.page.masterTitle },
        ]}
        title={C.page.masterTitle}
        subtitle={C.page.masterSubtitle}
      />

      <div className="px-4 py-6 md:px-6 lg:px-8">
        <ChatShell perspective="master" />
      </div>
    </>
  );
}
