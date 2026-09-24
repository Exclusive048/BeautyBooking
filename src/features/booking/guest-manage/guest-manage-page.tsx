"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, MapPin, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { ClientRescheduleModal } from "@/features/client-cabinet/bookings/client-reschedule-modal";
import type { GuestManageItem, GuestManageView } from "@/lib/bookings/guest-manage";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.guestManage;

export type GuestManagePageState =
  | {
      kind: "ok";
      view: GuestManageView;
      /** Подписи времени — salon-tz с меткой зоны, посчитаны на сервере. */
      whenLabels: Record<string, { when: string | null; proposed: string | null }>;
    }
  | { kind: "account" }
  | { kind: "invalid" };

type Props = {
  token: string;
  state: GuestManagePageState;
};

function statusVariant(status: GuestManageItem["status"]): "success" | "warning" | "muted" | "info" {
  if (status === "CONFIRMED" || status === "FINISHED") return "success";
  if (status === "REJECTED") return "muted";
  if (status === "IN_PROGRESS") return "info";
  return "warning";
}

/**
 * GUEST-MANAGE-LINK — страница управления записью для гостя: статус, время,
 * отмена (пакет — целиком) и запрос переноса (по услугам). Действия идут в
 * `/api/public/bookings/manage/{token}/…`, после — `router.refresh()`.
 */
export function GuestManagePage({ token, state }: Props) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [rescheduleItem, setRescheduleItem] = useState<GuestManageItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (state.kind !== "ok") {
    const isAccount = state.kind === "account";
    return (
      <Card>
        <CardContent className="space-y-4 p-6 text-center">
          <h1 className="font-display text-2xl text-text-main">{isAccount ? T.accountTitle : T.invalidTitle}</h1>
          <p className="text-sm text-text-sec">{isAccount ? T.accountBody : T.invalidBody}</p>
          <Button asChild variant={isAccount ? "primary" : "secondary"}>
            <Link href={isAccount ? "/login?next=/cabinet/bookings" : "/"}>{isAccount ? T.login : T.toHome}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { view, whenLabels } = state;
  const providerHref = view.providerPublicUsername ? `/u/${view.providerPublicUsername}` : null;

  async function handleCancel() {
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/bookings/manage/${encodeURIComponent(token)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error?: { message?: string } }
        | null;
      if (!res.ok || !json?.ok) {
        // Отказы действенные (дедлайн отмены, запись уже началась) — показываем
        // серверную строку, она говорит, что именно не так.
        setError((json && !json.ok ? json.error?.message : null) || T.cancelFailed);
        return;
      }
      setConfirmOpen(false);
      setNotice(T.cancelled);
      router.refresh();
    } catch {
      setError(T.cancelFailed);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="guest-manage-page">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
          {view.isPackage ? T.packageLabel : T.pageTitle}
        </p>
        <h1 className="mt-1 font-display text-2xl text-text-main">{view.providerName}</h1>
      </div>

      <Card>
        <CardContent className="divide-y divide-border-subtle p-0">
          {view.items.map((item) => {
            const labels = whenLabels[item.bookingId];
            return (
              <div key={item.bookingId} className="space-y-2 p-4" data-testid="guest-manage-item">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-medium text-text-main">{item.serviceTitle}</p>
                  <Badge variant={statusVariant(item.status)}>{T.status[item.status]}</Badge>
                </div>
                {labels?.when ? (
                  <p className="flex items-center gap-2 text-sm text-text-main">
                    <CalendarClock className="h-4 w-4 shrink-0 text-text-sec" aria-hidden strokeWidth={1.6} />
                    {labels.when}
                  </p>
                ) : null}
                {item.status === "CHANGE_REQUESTED" && labels?.proposed ? (
                  <p className="text-xs text-text-sec">{T.requestedTime.replace("{when}", labels.proposed)}</p>
                ) : null}
                {item.canReschedule ? (
                  <Button variant="secondary" size="sm" onClick={() => setRescheduleItem(item)}>
                    {T.reschedule}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="space-y-1.5 text-sm text-text-sec">
        {view.masterName && view.providerType === "STUDIO" ? (
          <p className="flex items-center gap-2">
            <UserRound className="h-4 w-4 shrink-0" aria-hidden strokeWidth={1.6} />
            {T.masterLabel}: {view.masterName}
          </p>
        ) : null}
        {view.providerAddress ? (
          <p className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden strokeWidth={1.6} />
            {view.providerAddress}
          </p>
        ) : null}
      </div>

      {notice ? (
        <p className="rounded-xl border border-success-border bg-success-surface p-3 text-sm text-success-text" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-danger-border bg-danger-surface p-3 text-sm text-danger-text" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        {view.canCancel ? (
          <Button variant="danger" onClick={() => setConfirmOpen(true)} disabled={cancelling}>
            {view.isPackage ? T.cancelPackage : T.cancel}
          </Button>
        ) : null}
        {providerHref ? (
          <Button asChild variant="ghost">
            <Link href={providerHref}>{T.bookAgain}</Link>
          </Button>
        ) : null}
      </div>
      {view.canCancel && view.cancellationDeadlineHours ? (
        <p className="text-xs text-text-sec">
          {T.deadlineHint.replace("{hours}", String(view.cancellationDeadlineHours))}
        </p>
      ) : null}

      <ConfirmModal
        open={confirmOpen}
        title={view.isPackage ? T.cancelPackageTitle : T.cancelTitle}
        message={view.isPackage ? T.cancelPackageBody : T.cancelBody}
        confirmLabel={cancelling ? T.cancelling : T.cancelConfirm}
        cancelLabel={T.keep}
        variant="danger"
        onConfirm={handleCancel}
        onCancel={() => setConfirmOpen(false)}
      />

      {rescheduleItem ? (
        <ClientRescheduleModal
          booking={{
            id: rescheduleItem.bookingId,
            startAtUtc: rescheduleItem.startAtUtc,
            service: { id: rescheduleItem.serviceId, name: rescheduleItem.serviceTitle },
            provider: { id: rescheduleItem.performerProviderId, name: view.providerName, timezone: view.timezone },
          }}
          manageToken={token}
          onClose={() => setRescheduleItem(null)}
          onSuccess={() => {
            setRescheduleItem(null);
            setNotice(T.rescheduleSent);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
