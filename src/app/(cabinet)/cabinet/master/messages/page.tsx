import { MasterMessagesPage } from "@/features/chat/master-messages-page";

export const runtime = "nodejs";

/** `/cabinet/master/messages` — chat foundation (33a). */
export default async function MasterMessagesRoute() {
  return <MasterMessagesPage />;
}
