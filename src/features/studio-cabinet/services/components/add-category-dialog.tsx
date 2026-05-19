"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.servicesV2.addCategoryDialog;
const E = UI_TEXT.studioCabinet.servicesV2.errors;

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * CATEGORY-UNIFICATION-A: proposes a new GlobalCategory (PENDING +
 * scoped to current user via `proposedBy/createdByUserId`). Replaces
 * the legacy studio-scoped `ServiceCategory` create flow. Mirrors the
 * master cabinet's "propose category" pattern.
 */
export function AddCategoryDialog({ open, onClose }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    if (submitting) return;
    setTitle("");
    setError(null);
    onClose();
  }

  async function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError(E.categoryTitleRequired);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/categories/propose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? E.categoryCreate);
        return;
      }
      setTitle("");
      onClose();
      router.refresh();
    } catch {
      setError(E.categoryCreate);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalSurface open={open} onClose={handleClose} title={T.title}>
      <div className="space-y-4">
        <p className="text-sm text-text-sec">{T.subtitle}</p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-main">
            {T.nameLabel}
          </span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={T.namePlaceholder}
            disabled={submitting}
            maxLength={120}
          />
        </label>
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            {T.cancel}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? T.submitting : T.submit}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
