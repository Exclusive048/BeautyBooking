import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { serverApiFetch } from "@/lib/api/server-fetch";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import { AccountType } from "@prisma/client";

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

  if (!last) redirect(`/cabinet/ensure-role?next=/cabinet${tabQs}`);

  if (last === "client") {
    redirect(`/cabinet/client${tabQs}`);
  }

  const roles = user.roles ?? [];
  const hasStudio = roles.includes(AccountType.STUDIO) || roles.includes(AccountType.STUDIO_ADMIN);
  const hasMaster = roles.includes(AccountType.MASTER);
  if (!hasStudio && !hasMaster) {
    redirect("/onboarding");
  }

  const providerResponse = await serverApiFetch<{ provider: ProviderProfileDto | null }>(
    "/api/providers/me"
  );

  if (!providerResponse.ok) {
    redirect(`/cabinet/client${tabQs}`);
  }

  let provider = providerResponse.data.provider;

  if (!provider) {
    const createResponse = await serverApiFetch<{ provider: ProviderProfileDto | null }>(
      "/api/providers/me",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }
    );

    if (createResponse.ok) {
      const reloadResponse = await serverApiFetch<{ provider: ProviderProfileDto | null }>(
        "/api/providers/me"
      );
      if (reloadResponse.ok) provider = reloadResponse.data.provider ?? createResponse.data.provider;
    }
  }

  if (!provider) {
    redirect(`/cabinet/client${tabQs}`);
  }

  if (provider.type === "STUDIO") redirect(`/cabinet/studio${tabQs}`);
  redirect(`/cabinet/master${tabQs}`);
}
