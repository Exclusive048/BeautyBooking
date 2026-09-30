"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import * as UI_TEXT from "@/lib/ui/text";

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

  // DELETION-03: без телефона подтверждаем словом — иначе аккаунты, созданные
  // через почту/VK/Яндекс (а в проде почта — основной вход), удалить нельзя.
  const confirmByPhone = Boolean(phone);
  const normalizedTarget = useMemo(() => (phone ? normalizeRussianPhone(phone) ?? phone : null), [phone]);
  const normalizedInput = useMemo(
    () => (value.trim() ? normalizeRussianPhone(value.trim()) ?? value.trim() : null),
    [value]
  );
  const wordMatches =
    value.trim().toLocaleUpperCase("ru-RU") === UI_TEXT.deletion.accountConfirmWord;

  const canConfirm = Boolean(
    checked && (confirmByPhone ? normalizedTarget && normalizedInput === normalizedTarget : wordMatches)
  );

  return (
    <ModalSurface key={open ? "open" : "closed"} open={open} onClose={onCancel} title={UI_TEXT.deletion.accountTitle}>
      <div className="space-y-4">
        <p className="text-sm text-text-sec">{UI_TEXT.deletion.accountWarning}</p>

        <label className="flex cursor-pointer items-start gap-2 text-sm text-text-sec">
          <Checkbox
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
            className="mt-1"
          />
          {UI_TEXT.deletion.accountConfirmCheckbox}
        </label>

        <label className="block text-xs text-text-sec">
          {confirmByPhone ? UI_TEXT.deletion.accountPhonePrompt : UI_TEXT.deletion.accountWordPrompt}
          <Input
            type={confirmByPhone ? "tel" : "text"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="mt-2 focus:ring-2 focus:ring-destructive/30"
            placeholder={confirmByPhone ? (phone ?? "+7") : UI_TEXT.deletion.accountConfirmWord}
            autoComplete="off"
          />
        </label>

        {error ? (
          <div role="alert" className="rounded-xl border border-danger-border bg-danger-surface px-3 py-2 text-xs text-danger-text">
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
