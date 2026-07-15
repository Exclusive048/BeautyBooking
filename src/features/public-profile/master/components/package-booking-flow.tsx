"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Clock, Package, Pencil, Sparkles } from "lucide-react";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateGrid } from "@/features/booking/components/booking-flow/components/date-grid";
import { TimeGrid } from "@/features/booking/components/booking-flow/components/time-grid";
import type { BookingFlowSlot } from "@/features/booking/components/booking-flow/types";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { nextComponentEarliestStart } from "@/lib/bookings/package-cursor";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { formatZoneLabel, zonesDifferForViewer } from "@/lib/ui/zone-label";
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
  /**
   * The master's between-bookings buffer, in minutes. This is the gap
   * `createSoloPackageBooking` requires between two package siblings
   * (`intraPackageOverlap(placement, bufferMin)`), so the wizard's cursor must
   * respect it — see `cursorIso` below.
   */
  providerBufferMin: number;
};

type Placement = { startAtUtc: string; endAtUtc: string };
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
type Phase = "build" | "review" | "contacts" | "success";
type SessionUser = { displayName: string | null; phone: string | null };

/**
 * PACKAGE-SOLO-WIZARD-01 — solo-master package booking as a per-component
 * wizard: date → time for service 1, date → time for service 2, … contacts
 * ONCE at the end, then ONE atomic `/book` creating all N bookings.
 *
 * Replaces the MVP-1 dialog, which asked only for the package's START and let
 * the server greedily auto-sequence the rest into the SAME day — a busy day
 * failed the whole package («Не удалось разместить …») with no way to place
 * service 2 yourself, and a hard-coded 14-calendar-day strip capped the
 * horizon.
 *
 * Two deliberate reuses:
 *   - `DateGrid`/`TimeGrid` — the SAME primitives the single-service widget
 *     uses. They're data-driven (`/booking-days` working days + the 60-day
 *     scan, paginated by week) so the horizon is now the normal booking horizon
 *     rather than a package-only literal, and `TimeGrid` carries the salon-tz
 *     «(город, GMT+N)» label the old package dialog omitted.
 *   - the studio wizard's SEQUENTIAL CURSOR (`studio-package-flow.tsx`):
 *     component N+1 may only start at/after component N's end, and re-picking a
 *     component cascade-clears the tail that depended on it. The backend
 *     enforces non-OVERLAP but NOT order, so this widget is what keeps the
 *     package sequential along the client's timeline.
 *
 * One correction vs a literal copy of studio: studio's cursor is the previous
 * end, which is right THERE because different-master pairs need no buffer. Solo
 * is one master, so `createSoloPackageBooking` requires the master's
 * between-bookings buffer between siblings — the cursor is `prevEnd + buffer`,
 * or the client could pick a slot the create then rejects with 409.
 *
 * Bookings materialise only in `handleConfirm` — nothing is written mid-wizard.
 */
export function PackageBookingFlow({
  open,
  onClose,
  bundle,
  providerId,
  providerTimezone,
  providerBufferMin,
}: Props) {
  const components = bundle.components;
  const viewerTz = useViewerTimeZoneContext();

  const [phase, setPhase] = useState<Phase>("build");
  const [placements, setPlacements] = useState<Record<string, Placement>>({});
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [proposing, setProposing] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [me, setMe] = useState<SessionUser | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // The first not-yet-placed component (in sortOrder) is the active one.
  const activeIndex = useMemo(
    () => components.findIndex((c) => !placements[c.serviceId]),
    [components, placements],
  );
  const activeComponent = activeIndex >= 0 ? components[activeIndex] ?? null : null;
  const allPlaced = activeIndex === -1;

  // Sequential along the CLIENT's timeline: the active component may only start
  // at/after the previous component's end + the master's buffer (gaps allowed).
  // The slots API can't apply this — the sibling isn't committed yet, so its
  // window still reads as free. `nextComponentEarliestStart` is pinned to the
  // create's own `intraPackageOverlap` boundary (package-cursor.test.ts).
  const cursorIso = useMemo(() => {
    if (activeIndex <= 0) return null;
    const prev = components[activeIndex - 1];
    if (!prev) return null;
    const placement = placements[prev.serviceId];
    if (!placement) return null;
    return nextComponentEarliestStart(
      new Date(placement.endAtUtc),
      providerBufferMin,
    ).toISOString();
  }, [activeIndex, components, placements, providerBufferMin]);

  const cursorDayKey = cursorIso ? toLocalDateKey(cursorIso, providerTimezone) : null;

  const fmtTime = useCallback(
    (iso: string) => UI_FMT.timeShort(iso, { timeZone: providerTimezone }),
    [providerTimezone],
  );
  const fmtWhen = useCallback(
    (startIso: string, endIso: string) =>
      `${UI_FMT.dateShort(startIso, { timeZone: providerTimezone })}, ${fmtTime(startIso)}–${fmtTime(endIso)}`,
    [fmtTime, providerTimezone],
  );

  // Salon-tz label (rule 17 / QA-107): package times are the MASTER's local
  // time. Show the explicit «(город, GMT+N)» only when the viewer's zone
  // differs, using a real placement instant so the offset is DST-correct.
  const refInstant =
    proposal?.components[0]?.startAtUtc ??
    (components[0] ? placements[components[0].serviceId]?.startAtUtc : null) ??
    null;
  const zoneLabel =
    refInstant &&
    zonesDifferForViewer({
      iso: refInstant,
      salonTimeZone: providerTimezone,
      viewerTimeZone: viewerTz,
    })
      ? formatZoneLabel({ iso: refInstant, timeZone: providerTimezone })
      : "";

  // Reset everything when the modal closes.
  useEffect(() => {
    if (!open) {
      setPhase("build");
      setPlacements({});
      setSelectedDay(null);
      setProposal(null);
      setError(null);
      setComment("");
    }
  }, [open]);

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

  const pickSlot = useCallback(
    (slot: BookingFlowSlot) => {
      if (!activeComponent) return;
      setPlacements((prev) => ({
        ...prev,
        [activeComponent.serviceId]: {
          startAtUtc: slot.startAtUtc,
          endAtUtc: slot.endAtUtc,
        },
      }));
      setSelectedDay(null);
      setError(null);
    },
    [activeComponent],
  );

  // Re-pick a placed component → cascade-clear it + every later one (their
  // cursor depended on it).
  const changeFrom = useCallback(
    (index: number) => {
      setPlacements((prev) => {
        const next: Record<string, Placement> = {};
        for (let i = 0; i < index; i += 1) {
          const c = components[i];
          if (c && prev[c.serviceId]) next[c.serviceId] = prev[c.serviceId]!;
        }
        return next;
      });
      setSelectedDay(null);
      setProposal(null);
      setError(null);
    },
    [components],
  );

  const buildSlots = useCallback(
    () =>
      components.map((c) => ({
        serviceId: c.serviceId,
        startAtUtc: placements[c.serviceId]!.startAtUtc,
      })),
    [components, placements],
  );

  const toReview = useCallback(async () => {
    if (!allPlaced) return;
    setProposing(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/packages/${encodeURIComponent(bundle.id)}/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots: buildSlots() }),
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
  }, [allPlaced, bundle.id, buildSlots]);

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
          slots: buildSlots(),
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error: { message: string } }
        | null;
      if (!res.ok || !json?.ok) {
        setError(json && !json.ok ? json.error.message : T.bookError);
        // A conflict means a placement went stale — send the client back to
        // rebuild. Nothing was created: the create is all-or-none.
        if (res.status === 409) {
          setPhase("build");
          setProposal(null);
        }
        return;
      }
      setPhase("success");
    } catch {
      setError(T.networkError);
    } finally {
      setSubmitting(false);
    }
  }, [bundle.id, buildSlots, comment, me, name, phone, proposal]);

  if (components.length === 0) return null;

  return (
    <ModalSurface open={open} onClose={onClose} title={bundle.name} size="lg">
      {phase === "build" ? (
        <div className="space-y-4" data-testid="package-wizard">
          <p className="text-sm text-text-sec">{T.buildHint}</p>

          <ol className="space-y-2">
            {components.map((component, index) => {
              const placement = placements[component.serviceId];
              const isActive = index === activeIndex;

              if (placement) {
                return (
                  <li
                    key={component.serviceId}
                    data-testid="package-component"
                    data-state="placed"
                    className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-text-main">
                          {component.name}
                        </div>
                        <div className="inline-flex items-center gap-1 text-xs text-text-sec">
                          <Clock className="h-3 w-3" aria-hidden />
                          {fmtWhen(placement.startAtUtc, placement.endAtUtc)}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => changeFrom(index)}
                      data-testid="package-change"
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-sec transition hover:text-text-main"
                    >
                      <Pencil className="h-3 w-3" aria-hidden /> {T.change}
                    </button>
                  </li>
                );
              }

              if (!isActive) {
                return (
                  <li
                    key={component.serviceId}
                    data-testid="package-component"
                    data-state="waiting"
                    className="flex items-center gap-2 rounded-xl border border-dashed border-border-subtle px-3 py-2.5 text-sm text-text-sec/70"
                  >
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-input text-xs text-text-sec">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate">{component.name}</div>
                      <div className="text-xs text-text-sec/60">{T.waitingPrevious}</div>
                    </div>
                  </li>
                );
              }

              // Active component — the date → time picker.
              return (
                <li
                  key={component.serviceId}
                  data-testid="package-component"
                  data-state="active"
                  className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-accent-text">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-text-main">
                        {component.name}
                      </div>
                      <div className="text-xs text-text-sec">
                        {T.componentLabel
                          .replace("{index}", String(index + 1))
                          .replace("{total}", String(components.length))}
                      </div>
                    </div>
                  </div>

                  <div data-testid="package-date-grid">
                    <DateGrid
                      providerId={providerId}
                      providerTimezone={providerTimezone}
                      selectedDateKey={selectedDay}
                      onSelect={setSelectedDay}
                      minDateKey={cursorDayKey}
                    />
                  </div>

                  {selectedDay ? (
                    <div data-testid="package-time-grid">
                      <TimeGrid
                        providerId={providerId}
                        serviceId={component.serviceId}
                        dateKey={selectedDay}
                        providerTimezone={providerTimezone}
                        selectedSlot={null}
                        onSelect={pickSlot}
                        minStartAtUtc={cursorIso}
                        emptyLabel={cursorIso ? T.noSlotsAfterPrevious : undefined}
                        showHotBadges={false}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          {allPlaced ? (
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={proposing}
              onClick={() => void toReview()}
              data-testid="package-to-review"
            >
              {proposing ? T.proposing : T.toReview}
            </Button>
          ) : null}
          <p className="text-[11px] text-text-sec/80">{T.startNote}</p>
        </div>
      ) : null}

      {phase === "review" && proposal ? (
        <div className="space-y-4" data-testid="package-review">
          <button
            type="button"
            onClick={() => setPhase("build")}
            className="inline-flex items-center gap-1 text-xs text-text-sec hover:text-text-main"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {T.back}
          </button>
          {zoneLabel ? (
            <p className="font-mono text-xs text-accent-text">{zoneLabel}</p>
          ) : null}
          <ul className="space-y-2">
            {proposal.components.map((c, i) => (
              <li
                key={`${c.serviceId}-${i}`}
                data-testid="package-review-row"
                className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-bg-card/60 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-text-main">{c.name}</div>
                  <div className="flex items-center gap-1 text-xs text-text-sec">
                    <Clock className="h-3 w-3" aria-hidden />
                    {fmtWhen(c.startAtUtc, c.endAtUtc)}
                  </div>
                </div>
                <div className="shrink-0 text-sm text-text-main">
                  {UI_FMT.priceLabel(c.discountedPrice)}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-border-subtle pt-3">
            <span className="text-sm text-text-sec">{T.total}</span>
            <span className="font-display text-lg text-text-main">
              {UI_FMT.priceLabel(proposal.totalKopeks)}
            </span>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => setPhase("contacts")}
            data-testid="package-continue"
          >
            {T.continue}
          </Button>
        </div>
      ) : null}

      {phase === "contacts" && proposal ? (
        <div className="space-y-4" data-testid="package-contacts">
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
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={T.namePlaceholder}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-text-sec">{T.phoneLabel}</span>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={T.phonePlaceholder}
                  inputMode="tel"
                />
              </label>
            </>
          ) : (
            <div className="rounded-xl border border-border-subtle bg-bg-input/60 px-3 py-2 text-sm text-text-sec">
              {T.bookingAs.replace("{name}", me.displayName ?? name)}
            </div>
          )}
          <label className="block text-sm">
            <span className="mb-1 block text-text-sec">{T.commentLabel}</span>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={T.commentPlaceholder}
            />
          </label>
          <div className="flex items-center justify-between border-t border-border-subtle pt-3">
            <span className="text-sm text-text-sec">{T.total}</span>
            <span className="font-display text-lg text-text-main">
              {UI_FMT.priceLabel(proposal.totalKopeks)}
            </span>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={submitting}
            onClick={() => void handleConfirm()}
            data-testid="package-submit"
          >
            {submitting ? T.submitting : T.submit}
          </Button>
        </div>
      ) : null}

      {phase === "success" ? (
        <div className="space-y-4 py-4 text-center" data-testid="package-success">
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

/** CTA button that opens the per-component package booking wizard (solo master only). */
export function PackageBookingButton({
  bundle,
  providerId,
  providerTimezone,
  providerBufferMin,
}: {
  bundle: PublicBundleView;
  providerId: string;
  providerTimezone: string;
  providerBufferMin: number;
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
        providerBufferMin={providerBufferMin}
      />
    </>
  );
}
