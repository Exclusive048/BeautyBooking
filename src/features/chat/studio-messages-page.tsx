import { redirect } from "next/navigation";
import { ChatShell } from "@/features/chat/chat-shell";
import { getSessionUser } from "@/lib/auth/session";
import { resolveStudioChatProviderId } from "@/lib/chat/studio-side";
import * as UI_TEXT from "@/lib/ui/text";

const C = UI_TEXT.chat;

/**
 * STUDIO-CHAT (запрос владельца 2026-10-31): `/cabinet/studio/messages` —
 * переписка с клиентами от имени студии. Пишут владелец и администраторы
 * студии (`chat/studio-side.ts`); мастеру студии экран недоступен (403), его
 * переписка — в кабинете мастера.
 */
export async function StudioMessagesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  try {
    await resolveStudioChatProviderId(user.id);
  } catch {
    redirect("/403");
  }

  return (
    <div className="space-y-3 lg:space-y-4">
      <h1 className="font-display text-2xl font-bold tracking-tight text-text-main md:text-3xl">
        {C.page.studioTitle}
      </h1>
      <ChatShell perspective="studio" />
    </div>
  );
}
