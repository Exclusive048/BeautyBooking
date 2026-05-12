"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DeleteAccountModal } from "@/components/deletion/DeleteAccountModal";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.account.account;

type Props = {
  phone: string | null;
};

/**
 * Danger zone framed in rose-tinted card. The actual confirm-and-delete
 * flow is delegated to the proven `<DeleteAccountModal>` (multi-step
 * confirm, phone re-entry) and `/api/me/delete` endpoint — same pieces
 * the client cabinet's `/settings` page uses. We just wrap them in a
 * card that matches the rest of the account-tab visual language.
 */
export function DangerZoneCard({ phone }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/me/delete", { method: "DELETE" });
      const json = (await response.json().catch(() => null)) as ApiResponse<{
        deleted: boolean;
      }> | null;
      if (!response.ok || !json || !json.ok) {
        throw new Error(
          json && !json.ok ? json.error.message : `Ошибка: ${response.status}`
        );
      }
      setOpen(false);
      router.push("/?deleted=1");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : T.dangerZoneTitle);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <section className="rounded-2xl border border-rose-200 bg-rose-50/40 p-5 dark:border-rose-900/40 dark:bg-rose-950/20">
        <header className="mb-3 flex items-center gap-2">
          <AlertTriangle
            className="h-4 w-4 text-rose-700 dark:text-rose-300"
            aria-hidden
          />
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300">
            {T.dangerZoneHeading}
          </p>
        </header>
        <h3 className="font-display text-base text-text-main">{T.dangerZoneTitle}</h3>
        <p className="mt-2 text-sm leading-relaxed text-text-sec">{T.dangerZoneBody}</p>
        <div className="mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
            className="gap-1.5 border border-rose-200 text-rose-700 hover:bg-rose-100/60 dark:border-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {T.dangerZoneTitle}
          </Button>
        </div>
      </section>

      <DeleteAccountModal
        open={open}
        phone={phone}
        onCancel={() => setOpen(false)}
        onConfirm={handleDelete}
        loading={loading}
        error={error}
      />
    </>
  );
}
