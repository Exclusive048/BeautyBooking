import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth/session";
import { ClientProfilePage } from "@/features/client-cabinet/profile/client-profile-page";
import { isEmailConfigured } from "@/lib/email/sender";
import { isVkAuthEnabled, isYandexAuthEnabled } from "@/lib/env";
import { loadMySetupGuides } from "@/lib/onboarding/setup-guide";

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
  // SETUP-GUIDE-01: «Первые шаги» кабинетов пользователя — здесь их возвращают
  // на главную после «Скрыть».
  const setupGuides = await loadMySetupGuides(userId);
  return (
    <ClientProfilePage
      userId={userId}
      setupGuides={setupGuides}
      emailEnabled={isEmailConfigured()}
      vkAuthEnabled={isVkAuthEnabled}
      yandexAuthEnabled={isYandexAuthEnabled}
    />
  );
}
