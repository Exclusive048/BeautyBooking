import { listProviderCards } from "@/lib/providers/queries";
import { ProvidersPageClient } from "@/features/catalog/components/providers-page-client";

export default async function PublicPage() {
  const providers = await listProviderCards();
  return <ProvidersPageClient providers={providers} />;
}
