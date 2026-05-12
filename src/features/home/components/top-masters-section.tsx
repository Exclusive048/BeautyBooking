import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { searchCatalog, type CatalogProviderItem } from "@/lib/catalog/catalog.service";
import { logError } from "@/lib/logging/logger";
import { providerPublicUrl } from "@/lib/public-urls";
import { UI_TEXT } from "@/lib/ui/text";

type TopMaster = {
  id: string;
  publicUsername: string | null;
  title: string;
  tagline: string | null;
  avatarUrl: string | null;
  ratingAvg: number;
  reviewsCount: number;
  primaryServiceTitle: string | null;
  primaryServicePrice: number | null;
  photo: string | null;
};

async function loadTopMasters(): Promise<TopMaster[] | null> {
  try {
    const result = await searchCatalog({
      entityType: "master",
      includeChildCategories: true,
      limit: 4,
    });
    const masters = result.items
      .filter((it): it is CatalogProviderItem => it.type === "master")
      .slice(0, 4)
      .map<TopMaster>((m) => ({
        id: m.id,
        publicUsername: m.publicUsername,
        title: m.title,
        tagline: m.tagline,
        avatarUrl: m.avatarUrl,
        ratingAvg: m.ratingAvg,
        reviewsCount: m.reviewsCount,
        primaryServiceTitle: m.primaryService?.title ?? null,
        primaryServicePrice: m.primaryService?.price ?? null,
        photo: m.photos[0] ?? null,
      }));
    return masters;
  } catch (err) {
    logError("TopMastersSection: failed to load", { error: String(err) });
    return null;
  }
}

function formatPriceRub(kopeks: number): string {
  return `${Math.round(kopeks / 100).toLocaleString("ru-RU")} ${UI_TEXT.common.currencyRub}`;
}

function MasterCard({ master }: { master: TopMaster }) {
  const profileHref = providerPublicUrl(
    { id: master.id, publicUsername: master.publicUsername },
    "card",
  ) ?? "#";

  return (
    <Link href={profileHref} className="group block">
      <Card className="overflow-hidden border-border-subtle/60 transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-card">
        {/* Cover photo */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
          {master.photo ? (
            <Image
              src={master.photo}
              alt={master.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
          ) : master.avatarUrl ? (
            <Image
              src={master.avatarUrl}
              alt={master.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-text-placeholder">
              {master.title.charAt(0).toUpperCase()}
            </div>
          )}
          {master.ratingAvg > 0 ? (
            <Badge className="absolute left-3 top-3 gap-1 border-0 bg-bg-card/95 px-2 py-1 text-text-main shadow-sm backdrop-blur-sm">
              <Star className="h-3 w-3 fill-primary text-primary" aria-hidden />
              <span className="font-mono text-xs font-semibold tabular-nums">
                {master.ratingAvg.toFixed(1)}
              </span>
            </Badge>
          ) : null}
        </div>

        {/* Info */}
        <div className="space-y-2 p-4">
          <h3 className="truncate text-base font-semibold text-text-main">{master.title}</h3>
          {master.tagline ? (
            <p className="line-clamp-1 text-xs text-text-sec">{master.tagline}</p>
          ) : null}
          {master.primaryServiceTitle && master.primaryServicePrice ? (
            <p className="text-sm text-text-sec">
              <span className="text-text-main">{master.primaryServiceTitle}</span>
              {" · "}
              <span className="font-mono tabular-nums">от {formatPriceRub(master.primaryServicePrice)}</span>
            </p>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}

export async function TopMastersSection() {
  const masters = await loadTopMasters();
  if (!masters || masters.length === 0) {
    return null;
  }

  const T = UI_TEXT.homeGuest.topMasters;

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-text-main sm:text-4xl">
          {T.title}{" "}
          <em className="font-display font-normal italic text-primary">{T.titleAccent}</em>
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base text-text-sec">{T.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {masters.map((master) => (
          <MasterCard key={master.id} master={master} />
        ))}
      </div>

      <div className="mt-10 text-center">
        <Link
          href="/catalog"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary-hover"
        >
          {T.seeAll}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

export function TopMastersSkeleton() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
      <div className="mb-10 text-center">
        <div className="mx-auto h-9 w-72 animate-pulse rounded-lg bg-muted" />
        <div className="mx-auto mt-3 h-5 w-96 max-w-full animate-pulse rounded bg-muted" />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-border-subtle/60 bg-bg-card">
            <div className="aspect-[4/3] w-full animate-pulse bg-muted" />
            <div className="space-y-2 p-4">
              <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
