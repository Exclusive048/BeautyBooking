import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import { prisma } from "@/lib/prisma";
import { PublicSettingsClient } from "@/features/billing/components/public-settings-client";
import { ClientViewLink } from "@/features/cabinet/components/client-view-link";
import { StudioPageHeader } from "@/features/studio-cabinet/components/studio-page-header";
import * as UI_TEXT from "@/lib/ui/text";

export const runtime = "nodejs";

export default async function StudioSettingsPublicPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Та же студия и тот же доступ (владелец или администратор), что у
  // `/api/cabinet/studio/public-username`, — страница показывает ровно тот
  // адрес, который этот запрос выдаст и переименует.
  let studioId: string;
  try {
    ({ studioId } = await requireStudioCabinetAdmin(user.id));
  } catch {
    redirect("/403");
  }

  // Визитке нужны те же поля, что у мастера (`/cabinet/master/settings/public`):
  // без них она рисовалась одним названием — без фото, адреса и описания.
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: {
      provider: {
        select: {
          name: true,
          tagline: true,
          address: true,
          description: true,
          avatarUrl: true,
          publicUsername: true,
        },
      },
    },
  });
  const provider = studio?.provider ?? null;
  const studioName = provider?.name ?? UI_TEXT.studioCabinet.layout.studioFallbackName;

  const publicUsername = provider?.publicUsername ?? null;

  // Шапка — как у остальных страниц кабинета студии; справа та же кнопка
  // «Посмотреть глазами клиента», что у мастера.
  return (
    <div className="space-y-5 lg:space-y-6">
      <StudioPageHeader
        caption={studioName}
        title={UI_TEXT.billing.publicPage.title}
        actions={<ClientViewLink publicUsername={publicUsername} />}
      />
      <PublicSettingsClient
        endpoint="/api/cabinet/studio/public-username"
        name={studioName}
        tagline={provider?.tagline ?? ""}
        address={provider?.address ?? ""}
        bio={provider?.description ?? ""}
        avatarUrl={provider?.avatarUrl ?? null}
        initialUsername={publicUsername}
      />
    </div>
  );
}
