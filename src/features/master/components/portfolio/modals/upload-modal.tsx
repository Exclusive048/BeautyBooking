"use client";

import { Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { cn } from "@/lib/cn";
import type { PortfolioCategoryOption } from "@/lib/master/portfolio-view.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.portfolioPage.upload;

type Props = {
  open: boolean;
  onClose: () => void;
  /** Master's provider id — required for the `/api/media` upload's
   * `entityId`. The view-service supplies it; client doesn't fetch. */
  providerId?: string;
  categories: PortfolioCategoryOption[];
};

const ACCEPT = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_BYTES = 10 * 1024 * 1024;

type QueuedFile = {
  file: File;
  previewUrl: string;
  errorCode?: "size" | "type";
};

/**
 * Two-step upload modal. The flow:
 *   1. POST /api/media (FormData, kind=PORTFOLIO) → returns asset
 *   2. POST /api/master/portfolio with { mediaAssetId } → creates row
 *   3. Optional PATCH to flip isPublic when the master picked the
 *      "create as hidden" checkbox (create defaults to `isPublic: true`)
 *
 * Per-file errors (size / type) are surfaced in the queue tile so the
 * master can replace before submitting. Sequential uploads keep the
 * progress bar deterministic and let one failure abort cleanly.
 */
export function UploadModal({ open, onClose, providerId, categories }: Props) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cachedProviderIdRef = useRef<string | null>(providerId ?? null);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [defaultCategoryId, setDefaultCategoryId] = useState<string>("");
  const [defaultPublic, setDefaultPublic] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progressDone, setProgressDone] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const validQueue = queue.filter((entry) => !entry.errorCode);

  const reset = () => {
    for (const entry of queue) {
      URL.revokeObjectURL(entry.previewUrl);
    }
    setQueue([]);
    setDefaultCategoryId("");
    setDefaultPublic(true);
    setIsDragging(false);
    setProgressDone(0);
    setError(null);
  };

  const close = () => {
    if (uploading) return;
    reset();
    onClose();
  };

  const ingest = (files: FileList | File[]) => {
    const next: QueuedFile[] = [];
    for (const file of Array.from(files)) {
      const previewUrl = URL.createObjectURL(file);
      let errorCode: QueuedFile["errorCode"];
      if (!ACCEPT.includes(file.type as (typeof ACCEPT)[number])) {
        errorCode = "type";
      } else if (file.size > MAX_BYTES) {
        errorCode = "size";
      }
      next.push({ file, previewUrl, errorCode });
    }
    setQueue((prev) => [...prev, ...next]);
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 0) {
      ingest(event.dataTransfer.files);
    }
  };

  const removeFromQueue = (index: number) => {
    const entry = queue[index];
    if (entry) URL.revokeObjectURL(entry.previewUrl);
    setQueue((prev) => prev.filter((_, i) => i !== index));
  };

  const resolveProviderId = async (): Promise<string | null> => {
    if (cachedProviderIdRef.current) return cachedProviderIdRef.current;
    // Empty-state contexts mount this modal without a providerId prop —
    // fall back to a one-shot lookup against the existing endpoint.
    try {
      const response = await fetch("/api/master/profile", { cache: "no-store" });
      const json = await response.json().catch(() => null);
      const id = json?.data?.master?.id ?? null;
      if (typeof id === "string" && id.length > 0) {
        cachedProviderIdRef.current = id;
        return id;
      }
    } catch {
      // fall through
    }
    return null;
  };

  const submit = async () => {
    if (validQueue.length === 0 || uploading) return;
    setUploading(true);
    setError(null);
    setProgressDone(0);
    try {
      const masterProviderId = await resolveProviderId();
      if (!masterProviderId) {
        setError(T.errorUpload);
        return;
      }
      let succeeded = 0;
      for (const entry of validQueue) {
        const form = new FormData();
        form.set("entityType", "MASTER");
        form.set("entityId", masterProviderId);
        form.set("kind", "PORTFOLIO");
        form.set("file", entry.file);

        const mediaResponse = await fetch("/api/media", { method: "POST", body: form });
        if (!mediaResponse.ok) {
          setError(T.errorUpload);
          return;
        }
        const mediaJson = await mediaResponse.json().catch(() => null);
        const assetId: string | null = mediaJson?.data?.asset?.id ?? null;
        if (!assetId) {
          setError(T.errorUpload);
          return;
        }

        const portfolioResponse = await fetch("/api/master/portfolio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mediaAssetId: assetId,
            serviceIds: [],
            ...(defaultCategoryId ? { globalCategoryId: defaultCategoryId } : {}),
          }),
        });
        if (!portfolioResponse.ok) {
          setError(T.errorUpload);
          return;
        }
        if (!defaultPublic) {
          const created = await portfolioResponse.json().catch(() => null);
          const itemId: string | null = created?.data?.id ?? null;
          if (itemId) {
            await fetch(`/api/master/portfolio/${itemId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isPublic: false }),
            });
          }
        }
        succeeded += 1;
        setProgressDone(succeeded);
      }
      reset();
      router.refresh();
      onClose();
    } finally {
      setUploading(false);
    }
  };

  return (
    <ModalSurface open={open} onClose={close} title={T.title} className="max-w-xl">
      <div className="space-y-4">
        <DropZone
          inputId={inputId}
          inputRef={inputRef}
          isDragging={isDragging}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onChange={(event) => {
            if (event.target.files) ingest(event.target.files);
            event.target.value = "";
          }}
        />

        {queue.length > 0 ? (
          <ul className="grid grid-cols-3 gap-2">
            {queue.map((entry, index) => (
              <li key={`${entry.file.name}-${index}`} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={entry.previewUrl}
                  alt=""
                  className={cn(
                    "aspect-square w-full rounded-xl border border-border-subtle object-cover",
                    entry.errorCode && "opacity-50"
                  )}
                />
                {entry.errorCode ? (
                  <p className="mt-1 text-[10px] leading-snug text-rose-700 dark:text-rose-300">
                    {entry.errorCode === "size" ? T.errorSize : T.errorType}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeFromQueue(index)}
                  aria-label={T.previewRemoveAria}
                  className="absolute right-1 top-1 rounded-full bg-bg-card/90 p-1 text-text-sec shadow-card hover:text-rose-700 dark:hover:text-rose-300"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div>
          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
            {T.defaultCategoryLabel}
          </label>
          <select
            value={defaultCategoryId}
            onChange={(event) => setDefaultCategoryId(event.target.value)}
            className="mt-1.5 block h-11 w-full rounded-xl border border-border-subtle bg-bg-input px-3 text-sm text-text-main focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <option value="">{T.defaultCategoryNone}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-text-sec">{T.defaultCategoryHint}</p>
        </div>

        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-main">
          <input
            type="checkbox"
            checked={defaultPublic}
            onChange={(event) => setDefaultPublic(event.target.checked)}
            className="h-4 w-4 rounded border border-border-subtle text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
          <span>{T.defaultPublicLabel}</span>
        </label>

        {uploading && validQueue.length > 0 ? (
          <div>
            <div className="h-1.5 overflow-hidden rounded-full bg-bg-input">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${(progressDone / validQueue.length) * 100}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-text-sec">
              {T.progressTemplate
                .replace("{done}", String(progressDone))
                .replace("{total}", String(validQueue.length))}
            </p>
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:border-rose-400/40 dark:bg-rose-950/40 dark:text-rose-300"
          >
            {error}
          </p>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="md" onClick={close} disabled={uploading}>
          {T.cancel}
        </Button>
        <Button
          variant="primary"
          size="md"
          onClick={submit}
          disabled={uploading || validQueue.length === 0}
        >
          {uploading
            ? T.submitting
            : validQueue.length > 0
              ? T.submitTemplate.replace("{count}", String(validQueue.length))
              : T.submit}
        </Button>
      </div>
    </ModalSurface>
  );
}

function DropZone({
  inputId,
  inputRef,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onChange,
}: {
  inputId: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  isDragging: boolean;
  onDragOver: (event: React.DragEvent<HTMLLabelElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent<HTMLLabelElement>) => void;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label
      htmlFor={inputId}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-border-subtle bg-bg-card/60 hover:border-primary/40"
      )}
    >
      <Upload className="mb-2 h-8 w-8 text-text-sec/60" aria-hidden />
      <p className="font-display text-base text-text-main">
        {isDragging ? T.dropZoneActive : T.dropZoneTitle}
      </p>
      <p className="mt-1 text-xs text-text-sec">{T.dropZoneSubtitle}</p>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT.join(",")}
        multiple
        onChange={onChange}
        className="sr-only"
      />
    </label>
  );
}
