import { redirect } from "next/navigation";
import { HeaderBlock } from "@/components/ui/header-block";
import { ChatShell } from "@/features/chat/chat-shell";
import { getSessionUser } from "@/lib/auth/session";
import { UI_TEXT } from "@/lib/ui/text";

const C = UI_TEXT.chat;

/** `/cabinet/messages` — client-side chat mirror (33a). */
export default async function ClientMessagesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <HeaderBlock title={C.page.clientTitle} subtitle={C.page.clientSubtitle} />
      <ChatShell perspective="client" />
    </div>
  );
}
