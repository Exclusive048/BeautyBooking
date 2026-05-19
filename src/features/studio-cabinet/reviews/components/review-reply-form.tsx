"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.reviewsV2.replyForm;
const E = UI_TEXT.studioCabinet.reviewsV2.toasts;

type Props = {
  reviewId: string;
  onCancel: () => void;
};

/**
 * Reply form for a single review. Posts to `/api/reviews/[id]/reply`
 * (existing endpoint, STUDIO-REVIEWS-A extended `ensureMasterReviewAccess`
 * to allow studio admin/owner). Reply text is the only payload — no
 * identity toggle. UI labels published replies «Ответ студии».
 */
export function ReviewReplyForm({ reviewId, onCancel }: Props) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? E.error);
        return;
      }
      setText("");
      onCancel();
      router.refresh();
    } catch {
      setError(E.error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-border-subtle bg-bg-input/40 p-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={T.placeholder}
        rows={3}
        disabled={submitting}
        maxLength={1000}
        aria-label={T.placeholder}
      />
      <p className="text-[11px] text-text-sec">{T.hint}</p>
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
          {T.cancel}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={submitting || text.trim().length === 0}
        >
          {submitting ? T.submitting : T.submit}
        </Button>
      </div>
    </div>
  );
}
