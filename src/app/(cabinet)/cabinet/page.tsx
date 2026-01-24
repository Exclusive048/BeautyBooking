import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { serverApiFetch } from "@/lib/api/server-fetch";
import type { ProviderProfileDto } from "@/lib/providers/dto";

export default async function CabinetEntryPage(props: {
  searchParams?: Promise<{ tab?: string }> | { tab?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const sp =
    props.searchParams instanceof Promise ? await props.searchParams : props.searchParams;

  const tab = sp?.tab === "profile" ? "profile" : "bookings";
  const tabQs = `?tab=${tab}`;

  const jar = await cookies();
  const last = jar.get("bh_last_role")?.value as "client" | "provider" | undefined;

  if (!last) redirect("/roles");

  if (last === "client") {
    redirect(`/cabinet/client${tabQs}`);
  }

  const providerResponse = await serverApiFetch<{ provider: ProviderProfileDto | null }>(
    "/api/providers/me"
  );

  if (!providerResponse.ok) {
    redirect(`/cabinet/client${tabQs}`);
  }

  const provider = providerResponse.data.provider;

  if (!provider) redirect("/onboarding");

  if (provider.type === "STUDIO") redirect(`/cabinet/studio${tabQs}`);
  redirect(`/cabinet/master${tabQs}`);
}
