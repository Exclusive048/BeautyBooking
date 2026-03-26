"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  open: boolean;
  phone: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  error?: string | null;
};

export function DeleteAccountModal({
  open,
  phone,
  onConfirm,
  onCancel,
  loading,
  error,
}: Props) {
  const [checked, setChecked] = useState(false);
  const [value, setValue] = useState("");

  const normalizedTarget = useMemo(() => (phone ? normalizeRussianPhone(phone) ?? phone : null), [phone]);
  const normalizedInput = useMemo(
    () => (value.trim() ? normalizeRussianPhone(value.trim()) ?? value.trim() : null),
    [value]
  );

  const canConfirm = Boolean(checked && normalizedTarget && normalizedInput === normalizedTarget);

  return (
    <ModalSurface key={open ? "open" : "closed"} open={open} onClose={onCancel} title={UI_TEXT.deletion.accountTitle}>
      <div className="space-y-4">
        <p className="text-sm text-text-sec">{UI_TEXT.deletion.accountWarning}</p>

        <label className="flex items-start gap-2 text-sm text-text-sec">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
            className="mt-1"
          />
          {UI_TEXT.deletion.accountConfirmCheckbox}
        </label>

        <label className="block text-xs text-text-sec">
          {UI_TEXT.deletion.accountPhonePrompt}
          <Input
            type="tel"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="mt-2 focus:ring-2 focus:ring-red-500/30"
            placeholder={phone ?? "+7"}
          />
        </label>

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
            disabled={!canConfirm || loading}
          >
            {loading ? UI_TEXT.status.deleting : UI_TEXT.deletion.accountDeleteForever}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
