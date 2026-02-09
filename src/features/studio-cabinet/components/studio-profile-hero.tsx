"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  bannerUrl?: string | null;
  avatar: ReactNode;
  title: string;
  description?: string | null;
  onEditBanner: () => void;
};

export function StudioProfileHero({ bannerUrl, avatar, title, description, onEditBanner }: Props) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-border-subtle bg-bg-card shadow-card">
      <div className="relative h-[200px] w-full overflow-hidden bg-bg-input">
        {bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-text-sec">
            Обложка студии
          </div>
        )}
        <div className="absolute right-4 top-4">
          <Button variant="secondary" size="sm" onClick={onEditBanner}>
            Изменить обложку
          </Button>
        </div>
        <div className="absolute -bottom-8 left-6">{avatar}</div>
      </div>

      <div className="px-6 pb-6 pt-12">
        <div>
          <div className="text-lg font-semibold text-text-main">{title}</div>
          {description ? <div className="mt-1 text-sm text-text-sec">{description}</div> : null}
        </div>
      </div>
    </section>
  );
}
