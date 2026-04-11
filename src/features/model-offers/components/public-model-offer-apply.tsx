"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent } from "react";
import { CheckCircle2, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, fetchJson, getErrorMessageByCode } from "@/lib/http/client";
import { UI_TEXT } from "@/lib/ui/text";

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
  offerCode: string;
  userId: string | null;
  loginHref: string;
};

const MAX_FILES = 3;

export function ModelOfferApplyForm({ offerCode, userId, loginHref }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fileNames = useMemo(() => files.map((file) => file.name).join(", "), [files]);

  if (!userId) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {UI_TEXT.pages.modelOffer.applyLoginPrompt}
        </p>
        <Button asChild variant="primary" className="w-full">
          <Link href={loginHref}>{UI_TEXT.pages.modelOffer.applyLoginCta}</Link>
        </Button>
      </div>
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
      setErrorText(UI_TEXT.pages.modelOffer.applyConsentError);
      return;
    }

    if (files.length === 0) {
      setErrorText(UI_TEXT.pages.modelOffer.applyPhotoError);
      return;
    }

    setLoading(true);
    try {
      const mediaIds = await uploadAssets();
      await fetchJson<ApplyResponse>(`/api/model-offers/${offerCode}/apply`, {
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
        setErrorText(mapped ?? error.message ?? UI_TEXT.pages.modelOffer.applyDefaultError);
      } else {
        setErrorText(UI_TEXT.pages.modelOffer.applyDefaultError);
      }
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/80 p-6 text-center dark:border-emerald-800/40 dark:bg-emerald-950/40"
      >
        <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden />
        <div>
          <p className="font-semibold text-emerald-800 dark:text-emerald-300">
            {UI_TEXT.pages.modelOffer.applySuccessTitle}
          </p>
          <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">
            {UI_TEXT.pages.modelOffer.applySuccessText}
          </p>
        </div>
        <Link
          href="/cabinet/model-applications"
          className="mt-1 text-sm font-medium text-emerald-700 underline underline-offset-2 hover:opacity-80 dark:text-emerald-400"
        >
          {UI_TEXT.pages.modelOffer.applySuccessLink}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {errorText ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {errorText}
        </div>
      ) : null}

      {/* Photo upload */}
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-foreground">
          {UI_TEXT.pages.modelOffer.applyPhotoLabel}
          <span className="ml-1 text-destructive" aria-hidden>*</span>
        </span>
        <div className="relative flex min-h-[80px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-4 text-center transition hover:bg-muted/70">
          <ImagePlus className="h-6 w-6 text-muted-foreground" aria-hidden />
          {files.length > 0 ? (
            <span className="text-xs text-foreground">
              {UI_TEXT.pages.modelOffer.applyPhotoSelected.replace("{names}", fileNames)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {UI_TEXT.pages.modelOffer.applyPhotoHint}
            </span>
          )}
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={onFileChange}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={UI_TEXT.pages.modelOffer.applyPhotoLabel}
          />
        </div>
      </label>

      {/* Note */}
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-foreground">
          {UI_TEXT.pages.modelOffer.applyNoteLabel}
        </span>
        <Textarea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={UI_TEXT.pages.modelOffer.applyNotePlaceholder}
          className="resize-none"
        />
      </label>

      {/* Consent */}
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
        />
        <span className="text-sm text-muted-foreground">
          {UI_TEXT.pages.modelOffer.applyConsentText}
        </span>
      </label>

      <Button
        onClick={submit}
        disabled={loading}
        variant="primary"
        className="w-full"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {UI_TEXT.pages.modelOffer.applySubmitLoading}
          </span>
        ) : (
          UI_TEXT.pages.modelOffer.applySubmitCta
        )}
      </Button>
    </div>
  );
}
