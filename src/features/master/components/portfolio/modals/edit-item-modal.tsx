"use client";

import { Crop, Replace, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ModalSurface } from "@/components/ui/modal-surface";
import { useConfirm } from "@/hooks/use-confirm";
import { fetchJson, fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import type {
  PortfolioCategoryOption,
  PortfolioItemView,
  PortfolioServiceOption,
  PortfolioTagOption,
} from "@/lib/master/portfolio-view.service";
import * as UI_TEXT from "@/lib/ui/text";
import { CropModal } from "./crop-modal";
import { TagInput } from "./tag-input";
import { Select } from "@/components/ui/select";
import { ChipButton } from "@/components/ui/chip-button";
import { FileInput } from "@/components/ui/file-input";

const T = UI_TEXT.cabinetMaster.portfolioPage.edit;

// Те же границы, что у загрузки новых работ (`upload-modal.tsx`); сервер
// проверяет их сам (`validate-image-upload.ts`) — здесь только быстрый отказ.
const REPLACE_ACCEPT = ["image/jpeg", "image/png", "image/webp"] as const;
const REPLACE_MAX_BYTES = 10 * 1024 * 1024;

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
 * (autocomplete), isPublic toggle, crop, replace photo, delete.
 *
 * «Заменить» (29.09 доработки · 01-в): новый файл уходит в `POST /api/media`
 * с `replaceAssetId`; сервер переносит строку работы на новый файл (услуги,
 * теги, порядок и видимость сохраняются) и только потом удаляет старый.
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
  const categorySelectId = useId();
  const tagsInputId = useId();
  const [categoryId, setCategoryId] = useState<string>(item.globalCategoryId ?? "");
  const [serviceIds, setServiceIds] = useState<string[]>(item.serviceIds);
  const [tagIds, setTagIds] = useState<string[]>(item.tagIds);
  const [isPublic, setIsPublic] = useState<boolean>(item.isPublic);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, modal: confirmModal } = useConfirm();
  const [cropOpen, setCropOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const replacePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !item.mediaAssetId || replacing) return;
    if (!(REPLACE_ACCEPT as readonly string[]).includes(file.type)) {
      setError(T.errorReplaceType);
      return;
    }
    if (file.size > REPLACE_MAX_BYTES) {
      setError(T.errorReplaceSize);
      return;
    }
    setReplacing(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("entityType", "MASTER");
      form.set("entityId", item.ownerProviderId);
      form.set("kind", "PORTFOLIO");
      form.set("replaceAssetId", item.mediaAssetId);
      form.set("file", file);
      await fetchJson("/api/media", { method: "POST", body: form });
      router.refresh();
    } catch (err) {
      setError(serverMessageOr(err, T.errorReplace));
    } finally {
      setReplacing(false);
    }
  };

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
    if (saving || replacing) return;
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (saving || replacing) return;
    setSaving(true);
    setError(null);
    try {
      await fetchJsonWithAuth<unknown>(`/api/master/portfolio/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          globalCategoryId: categoryId || null,
          serviceIds,
          tagIds,
          isPublic,
        }),
      });
      router.refresh();
      onClose();
    } catch (error) {
      setError(serverMessageOr(error, T.errorUpdate));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (saving || replacing) return;
    const ok = await confirm({
      message: T.confirmDelete,
      variant: "danger",
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      await fetchJsonWithAuth<unknown>(`/api/master/portfolio/${item.id}`, { method: "DELETE" });
      router.refresh();
      onClose();
    } catch (error) {
      setError(serverMessageOr(error, T.errorDelete));
    } finally {
      setSaving(false);
    }
  };

  const toggleService = (id: string) => {
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <>
      <ModalSurface
        open={open}
        onClose={close}
        title={T.title}
        className="max-w-2xl"
        fullScreenOnMobile
        stickyFooter
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            {/* `wrapper`, а не `ghost`: цвет текста варианта перебивал красный
                (cn — простая склейка). На телефоне — только корзина, чтобы
                подвал помещался в одну строку. */}
            <Button
              variant="wrapper"
              size="none"
              onClick={handleDelete}
              disabled={saving || replacing}
              aria-label={T.deleteCta}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-danger-text transition-colors hover:bg-danger-surface"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{T.deleteCta}</span>
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="md" onClick={close} disabled={saving || replacing}>
                {T.cancel}
              </Button>
              <Button variant="primary" size="md" onClick={submit} disabled={saving || replacing}>
                {saving ? T.submitting : T.submit}
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[180px,1fr]">
          <div className="space-y-2">
            <p className="eyebrow">
              {T.photoLabel}
            </p>
            <div className="aspect-square overflow-hidden rounded-xl border border-border-subtle bg-bg-input">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.mediaUrl}
                alt={T.photoAlt}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                disabled={!item.mediaAssetId || saving || replacing}
                onClick={() => setCropOpen(true)}
                className="gap-1.5"
              >
                <Crop className="h-3.5 w-3.5" aria-hidden />
                {T.cropCta}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!item.mediaAssetId || saving || replacing}
                onClick={() => replaceInputRef.current?.click()}
                className="gap-1.5"
                data-testid="portfolio-edit-replace"
              >
                <Replace className="h-3.5 w-3.5" aria-hidden />
                {replacing ? T.replacing : T.replaceCta}
              </Button>
              <FileInput
                ref={replaceInputRef}
                accept={REPLACE_ACCEPT.join(",")}
                tabIndex={-1}
                aria-hidden
                onChange={(event) => void replacePhoto(event)}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor={categorySelectId}
                className="eyebrow"
              >
                {T.categoryLabel}
              </label>
              <Select
                id={categorySelectId}
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="mt-1.5"
              >
                <option value="">{T.categoryNone}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="eyebrow">
                {T.servicesLabel}
              </label>
              {services.length === 0 ? (
                <p className="mt-1.5 text-xs italic text-text-sec">{T.servicesEmpty}</p>
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {services.map((service) => {
                    const active = serviceIds.includes(service.id);
                    return (
                      <ChipButton
                        key={service.id}
                        active={active}
                        onClick={() => toggleService(service.id)}
                      >
                        {service.name}
                      </ChipButton>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor={tagsInputId}
                className="eyebrow"
              >
                {T.tagsLabel}
              </label>
              <div className="mt-1.5">
                <TagInput
                  inputId={tagsInputId}
                  value={tagIds}
                  options={masterTags}
                  onChange={setTagIds}
                />
              </div>
            </div>

            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-main">
              <Checkbox
                checked={isPublic}
                onChange={(event) => setIsPublic(event.target.checked)}
              />
              <span>{T.isPublicLabel}</span>
            </label>

            {error ? (
              <p
                role="alert"
                className="rounded-xl border border-danger-border bg-danger-surface px-4 py-2 text-sm text-danger-text"
              >
                {error}
              </p>
            ) : null}
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
      {confirmModal}
    </>
  );
}
