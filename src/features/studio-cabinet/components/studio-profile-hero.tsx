"use client";

import type { ReactNode } from "react";
import { Camera, Pencil } from "lucide-react";
import { FocalImage } from "@/components/ui/focal-image";
import { Switch } from "@/components/ui/switch";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  bannerUrl?: string | null;
  bannerFocalX?: number | null;
  bannerFocalY?: number | null;
  avatar: ReactNode;
  studioName: string;
  subtitle: string;
  isPublished: boolean;
  onTogglePublished: (value: boolean) => void;
  onEditBanner: () => void;
  onEditFocal?: () => void;
};

export function StudioProfileHero({
  bannerUrl,
  bannerFocalX,
  bannerFocalY,
  avatar,
  studioName,
  subtitle,
  isPublished,
  onTogglePublished,
  onEditBanner,
  onEditFocal,
}: Props) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-border-subtle bg-bg-card shadow-card">
      <div className="relative h-[220px] w-full overflow-hidden bg-bg-input">
        {bannerUrl ? (
          <FocalImage
            src={bannerUrl}
            alt=""
            focalX={bannerFocalX}
            focalY={bannerFocalY}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <Camera className="h-6 w-6 text-white/40" />
            <span className="text-sm text-white/40">{UI_TEXT.studio.profile.coverUpload}</span>
          </div>
        )}
        <div className="absolute right-3 top-3 flex items-center gap-2">
          {onEditFocal ? (
            <button
              type="button"
              onClick={onEditFocal}
              className="rounded-xl bg-black/40 px-3 py-1.5 text-xs text-white backdrop-blur-sm transition-colors hover:bg-black/60"
            >
              {UI_TEXT.studio.profilePage.bannerFocusTitle}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onEditBanner}
            className="flex items-center gap-1.5 rounded-xl bg-black/40 px-3 py-1.5 text-xs text-white backdrop-blur-sm transition-colors hover:bg-black/60"
          >
            <Pencil className="h-3.5 w-3.5" />
            {UI_TEXT.studio.profile.editCover}
          </button>
        </div>
      </div>

      <div className="px-4 pb-4 md:px-6">
        <div className="-mt-10 flex items-end gap-4">
          {avatar}
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3 pb-1">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-text-main">
                {studioName || UI_TEXT.studio.profile.nameFallback}
              </h1>
              <p className="text-sm text-text-sec">{subtitle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-text-sec">
                {isPublished ? UI_TEXT.studio.profile.published : UI_TEXT.studio.profile.hidden}
              </span>
              <Switch checked={isPublished} onCheckedChange={onTogglePublished} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
