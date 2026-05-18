"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioGeneralData } from "../lib/types";

const T = UI_TEXT.studioCabinet.settingsV2.general;
const TX = UI_TEXT.studioCabinet.settingsV2.toasts;

type Props = {
  data: StudioGeneralData;
};

/**
 * Editable card for name / tagline / description. Persists via the
 * existing `PATCH /api/studios/[id]` endpoint (no new mutation surface
 * needed). Avatar/address editing live elsewhere (address requires the
 * geocode + map preview UI; avatar requires the MediaAsset uploader) —
 * surfaced read-only here with a Yandex Maps link for address review.
 */
export function GeneralForm({ data }: Props) {
  const router = useRouter();
  const [name, setName] = useState(data.name);
  const [tagline, setTagline] = useState(data.tagline);
  const [description, setDescription] = useState(data.description ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name !== data.name ||
    tagline !== data.tagline ||
    (description ?? "") !== (data.description ?? "");

  const handleSubmit = async () => {
    if (!dirty || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/studios/${encodeURIComponent(data.studioId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          tagline: tagline.trim(),
          description: description.trim() || null,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? TX.error);
        return;
      }
      router.refresh();
    } catch {
      setError(TX.error);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setName(data.name);
    setTagline(data.tagline);
    setDescription(data.description ?? "");
    setError(null);
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-text-main">{T.nameLabel}</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-text-main">{T.taglineLabel}</span>
        <Input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={140} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-text-main">{T.descriptionLabel}</span>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={2000}
        />
      </label>
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={reset} disabled={!dirty || submitting}>
          {UI_TEXT.studioCabinet.settingsV2.cancel}
        </Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={!dirty || submitting}>
          {submitting ? T.submitting : UI_TEXT.studioCabinet.settingsV2.save}
        </Button>
      </div>
    </div>
  );
}
