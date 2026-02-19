import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { hasStudioAdminAccess } from "@/lib/auth/studio-guards";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { StudioNavbar } from "@/features/studio-cabinet/components/studio-navbar";
import { providerPublicUrl } from "@/lib/public-urls";

export default async function StudioCabinetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const hasAccess = await hasStudioAdminAccess(user.id);
  if (!hasAccess) redirect("/403");

  let studioId: string;
  try {
    ({ studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  const providerRes = await serverApiFetch<{
    provider: { id: string; name: string; publicUsername: string | null } | null;
  }>(`/api/providers/me?studioId=${encodeURIComponent(studioId)}`);

  const provider = providerRes.ok ? providerRes.data.provider : null;
  const studioName = provider?.name ?? "Студия";
  const publicHref = provider?.publicUsername
    ? providerPublicUrl({ id: provider.id, publicUsername: provider.publicUsername }, "studio-cabinet")
    : "/cabinet/studio/settings/profile";
  const publicHint = provider?.publicUsername
    ? null
    : "Задайте публичный username, чтобы получить ссылку";

  return (
    <div className="min-h-dvh bg-bg-page">
      <StudioNavbar studioName={studioName} publicHref={publicHref} publicHint={publicHint} />
      <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6">{children}</div>
    </div>
  );
}
