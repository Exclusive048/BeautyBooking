import { StudioMessagesPage } from "@/features/chat/studio-messages-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `/cabinet/studio/messages` — переписка студии с клиентами (STUDIO-CHAT). */
export default async function StudioMessagesRoute() {
  return <StudioMessagesPage />;
}
