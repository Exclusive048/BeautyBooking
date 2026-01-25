import { prisma } from "@/lib/prisma";
import { mapProviderCard } from "@/lib/providers/mappers";

export async function listProviderCards() {
  const providers = await prisma.provider.findMany({
    orderBy: [{ rating: "desc" }, { reviews: "desc" }],
    select: {
      id: true,
      type: true,
      name: true,
      tagline: true,
      rating: true,
      reviews: true,
      priceFrom: true,
      address: true,
      district: true,
      categories: true,
      availableToday: true,
    },
  });

  return providers.map(mapProviderCard);
}
