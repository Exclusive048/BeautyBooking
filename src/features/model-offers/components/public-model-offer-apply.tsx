"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { ApiClientError, fetchJson, getErrorMessageByCode } from "@/lib/http/client";

type ApplyResponse = {
  application: {
    id: string;
    status: string;
    createdAt: string;
  };
};

type UploadResponse = {
  asset: { id: string };
};

type Props = {
  offerId: string;
  userId: string | null;
  loginHref: string;
};

const MAX_FILES = 3;

export function ModelOfferApplyForm({ offerId, userId, loginHref }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fileNames = useMemo(() => files.map((file) => file.name).join(", "), [files]);

  if (!userId) {
    return (
      <Button asChild className="w-full">
        <Link href={loginHref}>Войти, чтобы откликнуться</Link>
      </Button>
    );
  }
  const currentUserId = userId;

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(event.target.files ?? []).slice(0, MAX_FILES);
    setFiles(list);
    setSuccess(false);
    setErrorText(null);
  };

  async function uploadAssets(): Promise<string[]> {
    const mediaIds: string[] = [];
    for (const file of files) {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("entityType", "USER");
      formData.set("entityId", currentUserId);
      formData.set("kind", "MODEL_APPLICATION_PHOTO");

      const data = await fetchJson<UploadResponse>("/api/media", {
        method: "POST",
        body: formData,
      });

      mediaIds.push(data.asset.id);
    }

    return mediaIds;
  }

  async function submit() {
    if (!userId) {
      if (typeof window !== "undefined") {
        window.location.href = loginHref;
      }
      return;
    }

    setErrorText(null);
    setSuccess(false);

    if (!consent) {
      setErrorText("Нужно согласие на съёмку.");
      return;
    }

    if (files.length === 0) {
      setErrorText("Добавьте 1-3 фото для заявки.");
      return;
    }

    setLoading(true);
    try {
      const mediaIds = await uploadAssets();
      await fetchJson<ApplyResponse>(`/api/model-offers/${offerId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consentToShoot: consent,
          note: note.trim() || undefined,
          mediaIds,
        }),
      });

      setSuccess(true);
      setFiles([]);
      setNote("");
      setConsent(false);
    } catch (error) {
      if (error instanceof ApiClientError) {
        const mapped = getErrorMessageByCode(error.code);
        setErrorText(mapped ?? error.message ?? "Не удалось отправить заявку.");
      } else {
        setErrorText("Не удалось отправить заявку.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {errorText ? (
        <div role="alert" className="rounded-2xl border border-red-200/80 bg-red-50/80 px-4 py-3 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">
          {errorText}
        </div>
      ) : null}
      {success ? (
        <div role="status" className="rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-950/40 dark:text-emerald-300">
          <p>Заявка отправлена! Мастер рассмотрит её и предложит время.</p>
          <Link href="/cabinet/model-applications" className="mt-1 inline-block underline">
            Перейти в «Мои заявки на модель»
          </Link>
        </div>
      ) : null}

      <label className="block text-sm font-medium text-text-main">
        Фото для заявки
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={onFileChange}
          className="mt-2 w-full rounded-2xl border border-border/70 bg-bg-input px-3 py-2 text-sm"
        />
        <span className="mt-2 block text-xs text-text-sec">
          {files.length > 0 ? `Выбрано: ${fileNames}` : "Максимум 3 фото, JPG/PNG/WebP."}
        </span>
      </label>

      <label className="block text-sm font-medium text-text-main">
        Сообщение мастеру
        <textarea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Коротко расскажите о себе"
          className="mt-2 w-full resize-none rounded-2xl border border-border/70 bg-bg-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
      </label>

      <label className="flex items-start gap-3 text-sm text-text-sec">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border/70"
        />
        <span>Я согласен(а) на съёмку и использование фото в портфолио.</span>
      </label>

      <Button onClick={submit} disabled={loading} className="w-full">
        {loading ? "Отправляем..." : "Откликнуться"}
      </Button>
    </div>
  );
}
