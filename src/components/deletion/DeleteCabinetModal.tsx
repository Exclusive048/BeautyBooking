"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  open: boolean;
  type: "master" | "studio";
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  activeBookingsCount?: number | null;
  error?: string | null;
};

const CONFIRM_KEYWORD = UI_TEXT.deletion.confirmKeyword;

export function DeleteCabinetModal({
  open,
  type,
  onConfirm,
  onCancel,
  loading,
  activeBookingsCount,
  error,
}: Props) {
  const [value, setValue] = useState("");

  const isConfirmed = useMemo(
    () => value.trim().toUpperCase() === CONFIRM_KEYWORD,
    [value]
  );

  const warning =
    type === "master"
      ? UI_TEXT.deletion.masterWarning
      : UI_TEXT.deletion.studioWarning;

  const title = type === "master" ? UI_TEXT.deletion.masterTitle : UI_TEXT.deletion.studioTitle;

  return (
    <ModalSurface key={open ? "open" : "closed"} open={open} onClose={onCancel} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-text-sec">{warning}</p>

        <label className="block text-xs text-text-sec">
          {UI_TEXT.deletion.confirmPrompt.replace("{keyword}", CONFIRM_KEYWORD)}
          <Input
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="mt-2 focus:ring-2 focus:ring-red-500/30"
            placeholder={CONFIRM_KEYWORD}
          />
        </label>

        {typeof activeBookingsCount === "number" ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">
            {UI_TEXT.deletion.activeBookingsWarning.replace(
              "{count}",
              String(activeBookingsCount)
            )}
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={loading}
          >
            {UI_TEXT.actions.cancel}
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={!isConfirmed || loading}
          >
            {loading ? UI_TEXT.status.deleting : UI_TEXT.actions.delete}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
