"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Building2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormDialog } from "@/components/ui/form-dialog";
import { useRevalidateMe } from "@/lib/hooks/use-me";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.master.profile.leaveStudio;
const E = UI_TEXT.master.profile.errors;

type Props = {
  studioName: string;
  /** Будущие записи студии у мастера — сервер не даст выйти, пока они есть. */
  blockingBookings: number;
};

/**
 * 29.09 доработки · 04 — «Выйти из студии» в настройках аккаунта мастера.
 * Правило «нельзя уйти, пока есть будущие записи студии» решает сервер
 * (`leave-guard.ts`); здесь число показывается заранее, а отказ сервера — дословно
 * (действенный отказ, FIX-C8), кнопка не блокируется.
 */
export function StudioMembershipCard({ studioName, blockingBookings }: Props) {
  const router = useRouter();
  const revalidateMe = useRevalidateMe();
  const checkboxId = useId();
  const [open, setOpen] = useState(false);
  const [transferServices, setTransferServices] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const teamLabel = studioName.trim() ? T.teamTemplate.replace("{name}", studioName.trim()) : null;

  async function leave() {
    setError(null);
    try {
      await fetchJson("/api/cabinet/master/leave-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transferServices }),
      });
      setOpen(false);
      await revalidateMe();
      router.refresh();
    } catch (err) {
      setError(serverMessageOr(err, E.leaveStudio));
    }
  }

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5" data-testid="master-studio-membership">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bg-input text-text-sec">
          <Building2 className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base text-text-main">{T.bannerTitle}</h2>
          {teamLabel ? <p className="mt-0.5 text-sm font-medium text-text-main">{teamLabel}</p> : null}
          <p className="mt-2 text-sm leading-relaxed text-text-sec">{T.bannerDescription}</p>
          {blockingBookings > 0 ? (
            <p className="mt-3 rounded-xl border border-warning-border bg-warning-surface px-3 py-2 text-sm text-warning-text">
              {T.blockingNotice(blockingBookings)}{" "}
              <Link href="/cabinet/master/bookings" className="font-medium underline underline-offset-2">
                {T.openBookings}
              </Link>
            </p>
          ) : null}
          <div className="mt-4">
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setError(null);
                setOpen(true);
              }}
              data-testid="master-leave-studio"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              {T.bannerAction}
            </Button>
          </div>
        </div>
      </div>

      <FormDialog
        open={open}
        onClose={() => setOpen(false)}
        title={T.modalTitle}
        submitLabel={T.leaveAction}
        submitVariant="danger"
        onSubmit={leave}
        error={error}
      >
        <p className="text-sm text-text-sec">{T.modalDescription}</p>
        <label htmlFor={checkboxId} className="mt-4 flex cursor-pointer items-start gap-2.5">
          <Checkbox
            id={checkboxId}
            checked={transferServices}
            onChange={(event) => setTransferServices(event.target.checked)}
          />
          <span>
            <span className="block text-sm text-text-main">{T.transferServicesLabel}</span>
            <span className="mt-0.5 block text-xs text-text-sec">{T.transferServicesHint}</span>
          </span>
        </label>
      </FormDialog>
    </section>
  );
}
