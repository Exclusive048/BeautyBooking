"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { FieldLabel } from "@/components/ui/field-label";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

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
      await fetchJsonWithAuth<unknown>("/api/categories/propose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      setTitle("");
      onClose();
      router.refresh();
    } catch (error) {
      setError(serverMessageOr(error, E.categoryCreate));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalSurface open={open} onClose={handleClose} title={T.title}>
      <div className="space-y-4">
        <p className="text-sm text-text-sec">{T.subtitle}</p>
        <label className="block">
          <FieldLabel>
            {T.nameLabel}
          </FieldLabel>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={T.namePlaceholder}
            disabled={submitting}
            maxLength={120}
          />
        </label>
        {error ? (
          <div className="rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-text">
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
