"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.settingsV2.danger;
const TX = UI_TEXT.studioCabinet.settingsV2.toasts;

type Props = {
  /** Provider id — `/api/studios/[id]` keys on the Provider, not the Studio. */
  providerId: string;
  isPublished: boolean;
};

/**
 * Archive = `Provider.isPublished = false` via the existing
 * `PATCH /api/studios/[id]` endpoint. Reversible by re-publishing in the
 * «Профиль и медиа» section. Keeps studio data intact — different from the
 * permanent delete below.
 */
export function ArchiveToggle({ providerId, isPublished }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleArchive = async () => {
    if (submitting || !isPublished) return;
    if (!window.confirm(T.archiveConfirm)) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/studios/${encodeURIComponent(providerId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isPublished: false }),
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

  return (
    <div className="space-y-2">
      {isPublished ? (
        <Button variant="secondary" size="sm" onClick={handleArchive} disabled={submitting}>
          {submitting ? T.archiving : T.archiveButton}
        </Button>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-amber-700 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300">
          {T.archivedBadge}
        </span>
      )}
      {error ? (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
