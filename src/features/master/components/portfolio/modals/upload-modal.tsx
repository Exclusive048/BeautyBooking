"use client";

import { Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ModalSurface } from "@/components/ui/modal-surface";
import { PhotoActionButton } from "@/components/ui/photo-action-button";
import { cn } from "@/lib/cn";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import type { PortfolioCategoryOption } from "@/lib/master/portfolio-view.service";
import * as UI_TEXT from "@/lib/ui/text";
import { Select } from "@/components/ui/select";
import { FileInput } from "@/components/ui/file-input";

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
  const defaultCategorySelectId = useId();
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
      const data = await fetchJson<{ master?: { id?: string | null } | null }>(
        "/api/master/profile",
        { cache: "no-store" },
      );
      const id = data.master?.id ?? null;
      if (typeof id === "string" && id.length > 0) {
        cachedProviderIdRef.current = id;
        return id;
      }
    } catch {
      // fall through — этот отказ пользователю не показывается: у него нет
      // собственного смысла («не смогли выяснить, чей кабинет»), и вызывающий
      // ниже подставляет общий текст загрузки.
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

        const asset = await fetchJson<{ asset: { id: string } }>("/api/media", {
          method: "POST",
          body: form,
        });
        const assetId = asset.asset?.id ?? null;
        if (!assetId) {
          setError(T.errorUpload);
          return;
        }

        const created = await fetchJson<{ id?: string | null }>("/api/master/portfolio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mediaAssetId: assetId,
            serviceIds: [],
            ...(defaultCategoryId ? { globalCategoryId: defaultCategoryId } : {}),
          }),
        });
        if (!defaultPublic && created.id) {
          // Прежнее поведение сохранено ДОСЛОВНО: отказ этого PATCH'а не
          // прерывает загрузку. FIX-C8 меняет только то, КАКОЙ текст видит
          // пользователь, и не имеет права превратить нефатальный шаг в
          // фатальный — иначе сбой «сделать скрытой» обрывал бы загрузку
          // остальной очереди на полпути. Видимость правится из сетки
          // портфолио; расхождение «загрузилось публичной вместо скрытой»
          // существовало и до этой правки и остаётся отдельной задачей.
          try {
            await fetchJson(`/api/master/portfolio/${created.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isPublic: false }),
            });
          } catch {
            // намеренно проглочено — см. выше
          }
        }
        succeeded += 1;
        setProgressDone(succeeded);
      }
      reset();
      router.refresh();
      onClose();
    } catch (caught) {
      // RES-12: HTTP-ошибки тут были покрыты все четыре, а самый вероятный
      // сценарий — обрыв сети посреди загрузки большого файла — нет: `fetch`
      // бросает, `finally` гасит спиннер, `error` остаётся `null`. Модалка
      // открыта, очередь на месте, объяснений ноль, а необработанный rejection
      // уходит из обработчика клика.
      //
      // FIX-C8 · fromServer = ПОКАЗАТЬ СЕРВЕРНОЕ. Оба эндпоинта отвечают
      // отказами, которые пользователь может УСТРАНИТЬ: «Достигнут лимит
      // хранилища. Удалите ненужные файлы.» (`MEDIA_STORAGE_QUOTA_EXCEEDED`,
      // SEC-17), «Достигнут лимит работ в портфолио.»
      // (`MEDIA_PORTFOLIO_LIMIT_REACHED`, лимит тарифа), плюс `MEDIA_FILE_TOO_LARGE`
      // и `MEDIA_INVALID_MIME`. Прежнее «Не удалось загрузить файл. Попробуйте
      // ещё раз.» на всех четырёх было не просто менее полезным, а ВРЕДНЫМ
      // советом: «попробуйте ещё раз» отправляет мастера повторять загрузку в ту
      // же стену, тогда как выход — удалить лишнее либо сменить тариф.
      // Своя строка остаётся дефолтом для отказа без тела (обрыв сети, 5xx).
      setError(serverMessageOr(caught, T.errorUpload));
    } finally {
      setUploading(false);
    }
  };

  // На телефоне окно во весь экран: превью фото крупнее, а «Загрузить» всегда
  // под пальцем внизу экрана.
  return (
    <ModalSurface
      open={open}
      onClose={close}
      title={T.title}
      className="max-w-xl"
      fullScreenOnMobile
      stickyFooter
      footer={
        <>
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
        </>
      }
    >
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
                  alt={T.previewAltTemplate.replace("{name}", entry.file.name)}
                  className={cn(
                    "aspect-square w-full rounded-xl border border-border-subtle object-cover",
                    entry.errorCode && "opacity-50"
                  )}
                />
                {entry.errorCode ? (
                  <p className="mt-1 text-3xs leading-snug text-danger-text">
                    {entry.errorCode === "size" ? T.errorSize : T.errorType}
                  </p>
                ) : null}
                <PhotoActionButton
                  label={T.previewRemoveAria}
                  onClick={() => removeFromQueue(index)}
                  className="absolute right-0 top-0"
                >
                  <X className="h-4 w-4" aria-hidden />
                </PhotoActionButton>
              </li>
            ))}
          </ul>
        ) : null}

        <div>
          <label
            htmlFor={defaultCategorySelectId}
            className="eyebrow"
          >
            {T.defaultCategoryLabel}
          </label>
          <Select
            id={defaultCategorySelectId}
            value={defaultCategoryId}
            onChange={(event) => setDefaultCategoryId(event.target.value)}
            className="mt-1.5"
          >
            <option value="">{T.defaultCategoryNone}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <p className="mt-1.5 text-xs text-text-sec">{T.defaultCategoryHint}</p>
        </div>

        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-main">
          <Checkbox
            checked={defaultPublic}
            onChange={(event) => setDefaultPublic(event.target.checked)}
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
            className="rounded-xl border border-danger-border bg-danger-surface px-4 py-2 text-sm text-danger-text"
          >
            {error}
          </p>
        ) : null}
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
      {/* На тач-экране перетаскивать нечем — там просто «Выбрать фото». */}
      <p className="font-display text-base text-text-main [@media(pointer:coarse)]:hidden">
        {isDragging ? T.dropZoneActive : T.dropZoneTitle}
      </p>
      <p className="mt-1 text-xs text-text-sec [@media(pointer:coarse)]:hidden">{T.dropZoneSubtitle}</p>
      <p className="hidden font-display text-base text-text-main [@media(pointer:coarse)]:block">
        {T.selectFileCta}
      </p>
      <FileInput mode="label-target"
        ref={inputRef}
        id={inputId}
        accept={ACCEPT.join(",")}
        multiple
        onChange={onChange}
      />
    </label>
  );
}
