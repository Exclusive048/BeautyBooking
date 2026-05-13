"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminCityRow } from "@/features/admin-cabinet/cities/types";

const T = UI_TEXT.adminPanel.cities.deleteDialog;

type Props = {
  open: boolean;
  city: AdminCityRow | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export function DeleteCityConfirm({ open, city, onClose, onConfirm }: Props) {
  const [submitting, setSubmitting] = useState(false);
  if (!city) return null;
  const blocked = city.providersCount > 0;

  const submit = async () => {
    if (blocked) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalSurface open={open} onClose={onClose} title={T.title}>
      <div className="space-y-4">
        <p
          className={
            blocked
              ? "rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300"
              : "text-sm text-text-main"
          }
        >
          {blocked
            ? T.bodyBlocked
                .replace("{name}", city.name)
                .replace("{count}", String(city.providersCount))
            : T.bodyEmpty.replace("{name}", city.name)}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {T.cancel}
          </Button>
          <Button
            variant="danger"
            onClick={() => void submit()}
            disabled={submitting || blocked}
          >
            {T.delete}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
