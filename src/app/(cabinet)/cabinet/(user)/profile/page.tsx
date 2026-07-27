import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth/session";
import { ClientProfilePage } from "@/features/client-cabinet/profile/client-profile-page";
import { isEmailConfigured } from "@/lib/email/sender";
import { isVkAuthEnabled } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login?next=/cabinet/profile");

  // CATALOG-RANKING-01 item B: resolve the SMTP gate on the server and pass it
  // down — same shape as `/login` (`emailEnabled={isEmailConfigured()}`).
  // `sender.ts` reads server-only SMTP env, so the client can't evaluate it.
  // FIX-EXTERNAL-GATING-01 (G-3): resolve the full VK-auth gate on the server
  // (needs the server-only VK_CLIENT_ID) and pass it down — same shape as
  // `emailEnabled` / `/login`'s provider props. Gates the VK *connect* row;
  // disconnect stays reachable regardless.
  return (
    <ClientProfilePage
      userId={userId}
      emailEnabled={isEmailConfigured()}
      vkAuthEnabled={isVkAuthEnabled}
    />
  );
}
