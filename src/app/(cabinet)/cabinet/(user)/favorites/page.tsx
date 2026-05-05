import Link from "next/link";
import { redirect } from "next/navigation";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CatalogCard } from "@/features/catalog/components/catalog-card";
import { getSessionUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.clientCabinet.favorites;

export default async function FavoritesPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login?next=/cabinet/favorites");

  const rows = await prisma.userFavorite.findMany({
    where: {
      userId,
      // Hide unpublished providers — they may have paused their account
      // after being saved. Cascade handles physical deletes.
      provider: { isPublished: true },
    },
    orderBy: { createdAt: "desc" },
    include: {
      provider: {
        select: {
          id: true,
          type: true,
          name: true,
          tagline: true,
          publicUsername: true,
          avatarUrl: true,
          ratingAvg: true,
          reviews: true,
          priceFrom: true,
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="mb-1.5 font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">
          {T.eyebrow}
        </p>
        <h1 className="font-display text-3xl text-text-main lg:text-4xl">{T.title}</h1>
        <p className="mt-2 text-sm text-text-sec">
          {rows.length === 0
            ? T.descriptionEmpty
            : T.descriptionTemplate.replace("{count}", String(rows.length))}
        </p>
      </header>

      {rows.length === 0 ? (
        <FavoritesEmptyState />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <CatalogCard
              key={row.id}
              isAuthenticated
              initialFavorited
              serviceQuery=""
              item={{
                type: row.provider.type === "STUDIO" ? "studio" : "master",
                id: row.provider.id,
                publicUsername: row.provider.publicUsername,
                title: row.provider.name,
                tagline: row.provider.tagline?.trim() || null,
                avatarUrl: row.provider.avatarUrl,
                ratingAvg: row.provider.ratingAvg,
                reviewsCount: row.provider.reviews,
                photos: [],
                minPrice: row.provider.priceFrom > 0 ? row.provider.priceFrom : null,
                primaryService: null,
                nextSlot: null,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FavoritesEmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border-subtle p-12 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
        <Heart className="h-6 w-6" aria-hidden />
      </div>
      <h2 className="mb-2 font-display text-xl text-text-main">{T.empty.title}</h2>
      <p className="mx-auto mb-6 max-w-md leading-relaxed text-text-sec">
        {T.empty.description}
      </p>
      <Button asChild variant="primary">
        <Link href="/catalog">{T.empty.cta}</Link>
      </Button>
    </div>
  );
}
