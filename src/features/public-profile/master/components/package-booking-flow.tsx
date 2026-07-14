"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Package, Sparkles, Clock } from "lucide-react";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PublicBundleView } from "@/lib/master/public-profile-view.service";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.publicProfile.packageBooking;

type Props = {
  open: boolean;
  onClose: () => void;
  bundle: PublicBundleView;
  providerId: string;
  providerTimezone: string;
};

type Slot = { startAtUtc: string; endAtUtc: string; label?: string };
type ProposedComponent = {
  serviceId: string;
  name: string;
  startAtUtc: string;
  endAtUtc: string;
  durationMin: number;
  discountedPrice: number;
};
type Proposal = {
  packageName: string;
  totalKopeks: number;
  components: ProposedComponent[];
};
type Phase = "start" | "review" | "contacts" | "success";
type SessionUser = { displayName: string | null; phone: string | null };

function buildDays(count: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const base = new Date();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({
      key,
      label: d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", weekday: "short" }),
    });
  }
  return out;
}

export function PackageBookingFlow({ open, onClose, bundle, providerId, providerTimezone }: Props) {
  const firstService = bundle.components[0] ?? null;
  const days = useMemo(() => buildDays(14), []);

  const [phase, setPhase] = useState<Phase>("start");
  const [selectedDay, setSelectedDay] = useState(days[0]?.key ?? "");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const [proposing, setProposing] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [me, setMe] = useState<SessionUser | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset everything when the modal closes.
  useEffect(() => {
    if (!open) {
      setPhase("start");
      setProposal(null);
      setError(null);
      setSelectedDay(days[0]?.key ?? "");
      setComment("");
    }
  }, [open, days]);

  // Session prefill.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | { ok: true; data: { user: SessionUser | null } }
          | { ok: false }
          | null;
        if (cancelled || !json?.ok) return;
        const user = json.data.user;
        setMe(user);
        if (user?.displayName) setName((prev) => prev || user.displayName!.trim());
        if (user?.phone) setPhone((prev) => prev || user.phone!);
      } catch {
        /* anonymous — guest path */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Fetch start slots for component[0] when the day changes.
  useEffect(() => {
    if (!open || !firstService || !selectedDay) return;
    let cancelled = false;
    setSlotsLoading(true);
    setSlotsError(null);
    (async () => {
      try {
        const url = new URL(
          `/api/public/providers/${encodeURIComponent(providerId)}/slots`,
          window.location.origin,
        );
        url.searchParams.set("serviceId", firstService.serviceId);
        url.searchParams.set("from", selectedDay);
        url.searchParams.set("to", selectedDay);
        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | { ok: true; data: { slots: Slot[] } }
          | { ok: false }
          | null;
        if (cancelled) return;
        setSlots(json?.ok ? json.data.slots ?? [] : []);
        if (!json?.ok) setSlotsError(T.slotsError);
      } catch {
        if (!cancelled) setSlotsError(T.slotsError);
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, firstService, selectedDay, providerId]);

  const handlePickStart = useCallback(
    async (slot: Slot) => {
      setProposing(true);
      setError(null);
      try {
        const res = await fetch(`/api/public/packages/${encodeURIComponent(bundle.id)}/propose`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startAtUtc: slot.startAtUtc }),
        });
        const json = (await res.json().catch(() => null)) as
          | { ok: true; data: Proposal }
          | { ok: false; error: { message: string } }
          | null;
        if (!res.ok || !json?.ok) {
          setError(json && !json.ok ? json.error.message : T.proposeError);
          return;
        }
        setProposal(json.data);
        setPhase("review");
      } catch {
        setError(T.networkError);
      } finally {
        setProposing(false);
      }
    },
    [bundle.id],
  );

  const handleConfirm = useCallback(async () => {
    if (!proposal) return;
    const trimmedName = name.trim() || me?.displayName?.trim() || "";
    const trimmedPhone = (me?.phone ?? phone).trim();
    if (!trimmedName) {
      setError(T.nameRequired);
      return;
    }
    if (trimmedPhone.replace(/\D/g, "").length < 10) {
      setError(T.phoneInvalid);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/packages/${encodeURIComponent(bundle.id)}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: trimmedName,
          clientPhone: trimmedPhone,
          comment: comment.trim() || null,
          slots: proposal.components.map((c) => ({ serviceId: c.serviceId, startAtUtc: c.startAtUtc })),
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error: { message: string } }
        | null;
      if (!res.ok || !json?.ok) {
        setError(json && !json.ok ? json.error.message : T.bookError);
        // A conflict means the placement went stale — send the client back to re-pick.
        if (res.status === 409) setPhase("start");
        return;
      }
      setPhase("success");
    } catch {
      setError(T.networkError);
    } finally {
      setSubmitting(false);
    }
  }, [bundle.id, comment, me, name, phone, proposal]);

  if (!firstService) return null;

  const fmtTime = (iso: string) => UI_FMT.timeShort(iso, { timeZone: providerTimezone });

  return (
    <ModalSurface open={open} onClose={onClose} title={bundle.name} size="lg">
      {phase === "start" ? (
        <div className="space-y-4">
          <p className="text-sm text-text-sec">{T.startHint}</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {days.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => setSelectedDay(d.key)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-xs transition ${
                  selectedDay === d.key
                    ? "border-primary bg-primary/10 text-accent-text"
                    : "border-border-subtle text-text-sec hover:border-primary/60"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          {slotsLoading ? (
            <div className="py-6 text-center text-sm text-text-sec">{T.slotsLoading}</div>
          ) : slotsError ? (
            <div className="py-6 text-center text-sm text-red-600">{slotsError}</div>
          ) : slots.length === 0 ? (
            <div className="py-6 text-center text-sm text-text-sec">{T.noSlots}</div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((slot) => (
                <button
                  key={slot.startAtUtc}
                  type="button"
                  disabled={proposing}
                  onClick={() => void handlePickStart(slot)}
                  className="rounded-xl border border-border-subtle px-2 py-2 text-sm text-text-main transition hover:border-primary/60 disabled:opacity-50"
                >
                  {fmtTime(slot.startAtUtc)}
                </button>
              ))}
            </div>
          )}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <p className="text-[11px] text-text-sec/80">{T.startNote}</p>
        </div>
      ) : null}

      {phase === "review" && proposal ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setPhase("start")}
            className="inline-flex items-center gap-1 text-xs text-text-sec hover:text-text-main"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {T.back}
          </button>
          <ul className="space-y-2">
            {proposal.components.map((c, i) => (
              <li
                key={`${c.serviceId}-${i}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-bg-card/60 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-text-main">{c.name}</div>
                  <div className="flex items-center gap-1 text-xs text-text-sec">
                    <Clock className="h-3 w-3" aria-hidden />
                    {fmtTime(c.startAtUtc)}–{fmtTime(c.endAtUtc)}
                  </div>
                </div>
                <div className="shrink-0 text-sm text-text-main">{UI_FMT.priceLabel(c.discountedPrice)}</div>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-border-subtle pt-3">
            <span className="text-sm text-text-sec">{T.total}</span>
            <span className="font-display text-lg text-text-main">{UI_FMT.priceLabel(proposal.totalKopeks)}</span>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button variant="primary" size="lg" className="w-full" onClick={() => setPhase("contacts")}>
            {T.continue}
          </Button>
        </div>
      ) : null}

      {phase === "contacts" && proposal ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setPhase("review")}
            className="inline-flex items-center gap-1 text-xs text-text-sec hover:text-text-main"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {T.back}
          </button>
          {!me ? (
            <>
              <label className="block text-sm">
                <span className="mb-1 block text-text-sec">{T.nameLabel}</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={T.namePlaceholder} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-text-sec">{T.phoneLabel}</span>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={T.phonePlaceholder} inputMode="tel" />
              </label>
            </>
          ) : (
            <div className="rounded-xl border border-border-subtle bg-bg-input/60 px-3 py-2 text-sm text-text-sec">
              {T.bookingAs.replace("{name}", me.displayName ?? name)}
            </div>
          )}
          <label className="block text-sm">
            <span className="mb-1 block text-text-sec">{T.commentLabel}</span>
            <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={T.commentPlaceholder} />
          </label>
          <div className="flex items-center justify-between border-t border-border-subtle pt-3">
            <span className="text-sm text-text-sec">{T.total}</span>
            <span className="font-display text-lg text-text-main">{UI_FMT.priceLabel(proposal.totalKopeks)}</span>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={submitting}
            onClick={() => void handleConfirm()}
          >
            {submitting ? T.submitting : T.submit}
          </Button>
        </div>
      ) : null}

      {phase === "success" ? (
        <div className="space-y-4 py-4 text-center">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
            <Sparkles className="h-6 w-6" aria-hidden />
          </div>
          <div className="font-display text-xl text-text-main">{T.successTitle}</div>
          <p className="text-sm text-text-sec">{T.successBody}</p>
          <Button variant="secondary" size="md" onClick={onClose}>
            {T.close}
          </Button>
        </div>
      ) : null}
    </ModalSurface>
  );
}

/** CTA button that opens the package booking flow (solo master only). */
export function PackageBookingButton({
  bundle,
  providerId,
  providerTimezone,
}: {
  bundle: PublicBundleView;
  providerId: string;
  providerTimezone: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" size="md" className="w-full" onClick={() => setOpen(true)}>
        <Package className="mr-1.5 h-4 w-4" aria-hidden strokeWidth={1.8} />
        {T.cta}
      </Button>
      <PackageBookingFlow
        open={open}
        onClose={() => setOpen(false)}
        bundle={bundle}
        providerId={providerId}
        providerTimezone={providerTimezone}
      />
    </>
  );
}
