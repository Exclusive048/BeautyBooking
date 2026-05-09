"use client";

import { Crop, Replace, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { cn } from "@/lib/cn";
import type {
  PortfolioCategoryOption,
  PortfolioItemView,
  PortfolioServiceOption,
  PortfolioTagOption,
} from "@/lib/master/portfolio-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { CropModal } from "./crop-modal";
import { TagInput } from "./tag-input";

const T = UI_TEXT.cabinetMaster.portfolioPage.edit;

type Props = {
  open: boolean;
  onClose: () => void;
  item: PortfolioItemView;
  categories: PortfolioCategoryOption[];
  services: PortfolioServiceOption[];
  masterTags: PortfolioTagOption[];
};

/**
 * Full edit form. Category select, services multi-select, tag input
 * (autocomplete), isPublic toggle, crop trigger, delete. The
 * "Заменить" action is disabled in 31b — replacing the underlying
 * MediaAsset is a separate flow on the backlog.
 */
export function EditItemModal({
  open,
  onClose,
  item,
  categories,
  services,
  masterTags,
}: Props) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState<string>(item.globalCategoryId ?? "");
  const [serviceIds, setServiceIds] = useState<string[]>(item.serviceIds);
  const [tagIds, setTagIds] = useState<string[]>(item.tagIds);
  const [isPublic, setIsPublic] = useState<boolean>(item.isPublic);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  // React 19 sync-to-props (compare during render). When the master
  // clicks "Edit" on a different item without closing the page, the
  // useState initialiser only runs once — this guard refreshes the
  // form fields.
  const [prevItemId, setPrevItemId] = useState(item.id);
  if (prevItemId !== item.id) {
    setPrevItemId(item.id);
    setCategoryId(item.globalCategoryId ?? "");
    setServiceIds(item.serviceIds);
    setTagIds(item.tagIds);
    setIsPublic(item.isPublic);
    setError(null);
  }

  const close = () => {
    if (saving) return;
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/master/portfolio/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          globalCategoryId: categoryId || null,
          serviceIds,
          tagIds,
          isPublic,
        }),
      });
      if (!response.ok) {
        setError(T.errorUpdate);
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError(T.errorUpdate);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (saving) return;
    if (!window.confirm(T.confirmDelete)) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/master/portfolio/${item.id}`, { method: "DELETE" });
      if (!response.ok) {
        setError(T.errorDelete);
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError(T.errorDelete);
    } finally {
      setSaving(false);
    }
  };

  const toggleService = (id: string) => {
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <>
      <ModalSurface open={open} onClose={close} title={T.title} className="max-w-2xl">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[180px,1fr]">
          <div className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
              {T.photoLabel}
            </p>
            <div className="aspect-square overflow-hidden rounded-xl border border-border-subtle bg-bg-input">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.mediaUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                disabled={!item.mediaAssetId || saving}
                onClick={() => setCropOpen(true)}
                className="gap-1.5"
              >
                <Crop className="h-3.5 w-3.5" aria-hidden />
                {T.cropCta}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled
                title={T.replaceSoonHint}
                className="gap-1.5"
              >
                <Replace className="h-3.5 w-3.5" aria-hidden />
                {T.replaceCta}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
                {T.categoryLabel}
              </label>
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="mt-1.5 block h-11 w-full rounded-xl border border-border-subtle bg-bg-input px-3 text-sm text-text-main focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <option value="">{T.categoryNone}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
                {T.servicesLabel}
              </label>
              {services.length === 0 ? (
                <p className="mt-1.5 text-xs italic text-text-sec">{T.servicesEmpty}</p>
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {services.map((service) => {
                    const active = serviceIds.includes(service.id);
                    return (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => toggleService(service.id)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                          active
                            ? "border-primary bg-primary text-white"
                            : "border-border-subtle bg-bg-card text-text-main hover:border-primary/40"
                        )}
                      >
                        {service.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
                {T.tagsLabel}
              </label>
              <div className="mt-1.5">
                <TagInput value={tagIds} options={masterTags} onChange={setTagIds} />
              </div>
            </div>

            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-main">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(event) => setIsPublic(event.target.checked)}
                className="h-4 w-4 rounded border border-border-subtle text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              />
              <span>{T.isPublicLabel}</span>
            </label>

            {error ? (
              <p
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:border-rose-400/40 dark:bg-rose-950/40 dark:text-rose-300"
              >
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={saving}
            className="gap-1.5 text-rose-700 dark:text-rose-300"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {T.deleteCta}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="md" onClick={close} disabled={saving}>
              {T.cancel}
            </Button>
            <Button variant="primary" size="md" onClick={submit} disabled={saving}>
              {saving ? T.submitting : T.submit}
            </Button>
          </div>
        </div>
      </ModalSurface>

      {cropOpen && item.mediaAssetId ? (
        <CropModal
          open={cropOpen}
          onClose={() => setCropOpen(false)}
          assetId={item.mediaAssetId}
          imageUrl={item.mediaUrl}
        />
      ) : null}
    </>
  );
}
