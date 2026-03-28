"use client";

import type { ReactNode } from "react";
import { Camera, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  onRemoveBanner?: () => void;
  onEditFocal?: () => void;
  isBusy?: boolean;
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
  onRemoveBanner,
  onEditFocal,
  isBusy = false,
}: Props) {
  const publicationLabel = UI_TEXT.studio.profile.publicationLabel;

  return (
    <section className="overflow-hidden rounded-[24px] border border-border-subtle bg-bg-card shadow-card">
      <div className="relative h-[220px] w-full overflow-hidden bg-bg-input">
        <Button
          variant="wrapper"
          onClick={onEditBanner}
          disabled={isBusy}
          className="group relative block h-full w-full overflow-hidden text-left focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-80"
          aria-label={UI_TEXT.studio.profile.coverUpload}
        >
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
          <div
            className={`pointer-events-none absolute inset-0 bg-black/30 transition-opacity ${
              bannerUrl ? "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" : "opacity-100"
            }`}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent px-4 pb-3 pt-8">
            <span className="text-sm font-medium text-white">
              {bannerUrl ? UI_TEXT.studio.profile.editCover : UI_TEXT.studio.profile.coverUpload}
            </span>
          </div>
        </Button>
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          {onEditFocal ? (
            <Button
              variant="ghost"
              size="none"
              onClick={onEditFocal}
              disabled={isBusy}
              className="rounded-xl bg-black/40 px-3 py-1.5 text-xs text-white backdrop-blur-sm transition-colors hover:bg-black/60"
            >
              {UI_TEXT.studio.profilePage.bannerFocusTitle}
            </Button>
          ) : null}
          {bannerUrl && onRemoveBanner ? (
            <Button
              variant="ghost"
              size="none"
              onClick={onRemoveBanner}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-black/40 px-2.5 py-1.5 text-xs text-white backdrop-blur-sm transition-colors hover:bg-black/60 disabled:opacity-60"
              aria-label={UI_TEXT.actions.remove}
              title={UI_TEXT.actions.remove}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {UI_TEXT.actions.remove}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="px-4 py-4 md:px-6">
        <div className="flex items-center gap-4 md:gap-5">
          {avatar}
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-text-main">
                {studioName || UI_TEXT.studio.profile.nameFallback}
              </h1>
              <p className="text-sm text-text-sec">{subtitle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
              <span className="text-xs text-text-sec">{publicationLabel}</span>
              <Switch checked={isPublished} onCheckedChange={onTogglePublished} disabled={isBusy} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
