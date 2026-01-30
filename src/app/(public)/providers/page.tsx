import { listProviderCards } from "@/lib/providers/queries";
import { ProvidersPageClient } from "@/features/catalog/components/providers-page-client";

export default async function ProvidersPage() {
  const providers = await listProviderCards();
  return <ProvidersPageClient providers={providers} />;
}
