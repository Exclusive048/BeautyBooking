"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";
import { providerPublicUrl, studioBookingUrl } from "@/lib/public-urls";
import { FocalImage } from "@/components/ui/focal-image";

export type StudioMasterCard = {
  id: string;
  name: string;
  publicUsername: string | null;
};

type PortfolioFeedItem = {
  mediaUrl: string;
};

type MasterExtra = {
  avatarUrl: string | null;
  avatarFocalX: number | null;
  avatarFocalY: number | null;
  specialization: string | null;
  grade: string;
  portfolioThumbs: string[];
};

type Props = {
  studio: { id: string; publicUsername: string | null };
  masters: StudioMasterCard[];
};

function gradeLabel(rating: number, reviews: number): string {
  if (reviews >= 50 && rating >= 4.8) return UI_TEXT.publicStudio.gradeTop;
  if (reviews >= 10 && rating >= 4.5) return UI_TEXT.publicStudio.gradePro;
  return UI_TEXT.publicStudio.gradeNew;
}

export function StudioMastersCarousel({ studio, masters }: Props) {
  const [extras, setExtras] = useState<Record<string, MasterExtra>>({});

  useEffect(() => {
    if (masters.length === 0) return;
    let cancelled = false;

    async function load() {
      const entries = await Promise.all(
        masters.map(async (master) => {
          const [profileRes, portfolioRes] = await Promise.all([
            fetch(`/api/providers/${master.id}`, { cache: "no-store" }),
            fetch(`/api/feed/portfolio?masterId=${encodeURIComponent(master.id)}&limit=3`, {
              cache: "no-store",
            }),
          ]);

          const profileJson = (await profileRes.json().catch(() => null)) as ApiResponse<{
            provider: ProviderProfileDto | null;
          }> | null;
          const portfolioJson = (await portfolioRes.json().catch(() => null)) as ApiResponse<{
            items: PortfolioFeedItem[];
          }> | null;

          const provider = profileRes.ok && profileJson && profileJson.ok ? profileJson.data.provider : null;
          const portfolio = portfolioRes.ok && portfolioJson && portfolioJson.ok ? portfolioJson.data.items : [];

          const value: MasterExtra = {
            avatarUrl: provider?.avatarUrl ?? null,
            avatarFocalX: provider?.avatarFocalX ?? null,
            avatarFocalY: provider?.avatarFocalY ?? null,
            specialization: provider?.tagline?.trim() || null,
            grade: gradeLabel(provider?.rating ?? 0, provider?.reviews ?? 0),
            portfolioThumbs: portfolio.slice(0, 3).map((item) => item.mediaUrl),
          };

          return [master.id, value] as const;
        })
      );

      if (cancelled) return;
      setExtras(Object.fromEntries(entries));
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [masters]);

  const hasMasters = masters.length > 0;
  const masterCards = useMemo(
    () =>
      masters.map((master) => {
        const extra = extras[master.id];
        return {
          ...master,
          avatarUrl: extra?.avatarUrl ?? null,
          avatarFocalX: extra?.avatarFocalX ?? null,
          avatarFocalY: extra?.avatarFocalY ?? null,
          specialization: extra?.specialization ?? null,
          grade: extra?.grade ?? UI_TEXT.publicStudio.gradeNew,
          thumbs: extra?.portfolioThumbs ?? [],
        };
      }),
    [extras, masters]
  );

  if (!hasMasters) {
    return <div className="rounded-2xl border border-border-subtle bg-bg-card p-6 text-sm text-text-sec">{UI_TEXT.publicStudio.noMasters}</div>;
  }

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max gap-4">
        {masterCards.map((master) => {
          const masterHref = providerPublicUrl(
            { id: master.id, publicUsername: master.publicUsername },
            "studio-masters-carousel"
          ) ?? "#";
          const bookingHref = studioBookingUrl(
            studio,
            master.publicUsername ? { master: master.publicUsername } : undefined,
            "studio-masters-carousel"
          ) ?? "#";

          return (
            <article key={master.id} className="group relative w-72 overflow-hidden rounded-2xl border border-border-subtle bg-bg-card shadow-card">
              <div className="relative h-48 overflow-hidden bg-muted">
                {master.avatarUrl ? (
                  <FocalImage
                    src={master.avatarUrl}
                    alt={master.name}
                    focalX={master.avatarFocalX}
                    focalY={master.avatarFocalY}
                    className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="h-full w-full bg-bg-input" />
                )}
                <div className="absolute left-3 top-3 rounded-full border border-border-subtle bg-bg-card/80 px-2 py-1 text-xs font-medium text-text-main backdrop-blur">
                  {master.grade}
                </div>

                <div className="absolute inset-x-0 bottom-0 translate-y-full bg-black/65 p-3 transition duration-200 group-hover:translate-y-0">
                  {master.thumbs.length > 0 ? (
                    <div className="grid grid-cols-3 gap-1">
                      {master.thumbs.map((thumb, index) => (
                        <div key={`${master.id}-${index}`} className="relative h-12 w-full overflow-hidden rounded-md">
                          <Image src={thumb} alt="" fill sizes="80px" className="object-cover" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-white/80">{UI_TEXT.publicStudio.noPortfolio}</div>
                  )}
                </div>
              </div>

              <div className="space-y-2 p-4">
                <div className="text-sm font-semibold text-text">{master.name}</div>
                {master.specialization ? <div className="text-xs text-text-muted">{master.specialization}</div> : null}
                <div className="flex items-center gap-2">
                  <Link href={masterHref} className="text-xs font-medium text-text underline underline-offset-2">
                    {UI_TEXT.publicStudio.openMaster}
                  </Link>
                  <Button asChild size="sm" className="ml-auto h-8 rounded-lg px-2.5 text-xs">
                    <Link href={bookingHref}>{UI_TEXT.publicStudio.book}</Link>
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
