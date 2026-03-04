"use client";

import { useEffect, useMemo, useState } from "react";
import { ModalSurface } from "@/components/ui/modal-surface";

type Props = {
  open: boolean;
  type: "master" | "studio";
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  activeBookingsCount?: number | null;
  error?: string | null;
};

const CONFIRM_KEYWORD = "УДАЛИТЬ";

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

  useEffect(() => {
    if (!open) return;
    setValue("");
  }, [open]);

  const isConfirmed = useMemo(
    () => value.trim().toUpperCase() === CONFIRM_KEYWORD,
    [value]
  );

  const warning =
    type === "master"
      ? "Удаление кабинета мастера необратимо. Все услуги, расписание и портфолио будут удалены. История завершённых записей сохраняется в соответствии с законодательством."
      : "Все мастера студии получат уведомление о расформировании. Удаление невозможно если есть незавершённые записи.";

  const title = type === "master" ? "Удаление кабинета мастера" : "Удаление кабинета студии";

  return (
    <ModalSurface open={open} onClose={onCancel} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-text-sec">{warning}</p>

        <label className="block text-xs text-text-sec">
          Для подтверждения введите «{CONFIRM_KEYWORD}»
          <input
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="mt-2 w-full rounded-xl border border-border-subtle bg-bg-input px-3 py-2 text-sm text-text-main outline-none focus:ring-2 focus:ring-red-500/30"
            placeholder={CONFIRM_KEYWORD}
          />
        </label>

        {typeof activeBookingsCount === "number" ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            Сначала завершите или отмените все активные записи ({activeBookingsCount} шт.)
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-border-subtle px-4 py-2 text-sm text-text-sec transition hover:bg-bg-input/60"
            disabled={loading}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!isConfirmed || loading}
            className="rounded-xl border border-red-300/60 px-4 py-2 text-sm text-red-600 transition hover:bg-red-50/50 disabled:opacity-50"
          >
            {loading ? "Удаляем..." : "Удалить"}
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
