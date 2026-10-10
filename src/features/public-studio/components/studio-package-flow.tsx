"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Clock, Package, Pencil, Sparkles, User } from "lucide-react";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/ui/field-label";
import { LegalConsentGroup } from "@/features/auth/components/legal-consent-group";
import {
  EMPTY_CONSENT_FLAGS,
  hasRequiredConsents,
  type ConsentFlags,
} from "@/lib/legal/consent-flags";
import {
  fetchBookingMe,
  fetchMasterAvailability,
  todayKey,
  buildDayOptions,
  type SlotItem,
  type StudioMaster,
} from "@/features/booking/lib/studio-booking";
import type { StudioBundleView } from "@/lib/providers/public-packages";
import {
  studioNextComponentEarliestStart,
  type StudioPlacedComponent,
} from "@/lib/bookings/package-cursor";
import { UI_FMT } from "@/lib/ui/fmt";
import { ApiClientError, fetchJson, readApiResponse, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { GuestManageLinkCard } from "@/features/booking/components/guest-manage-link-card";
import { fetchRetryingDuplicates } from "@/lib/http/idempotent-retry";

const T = UI_TEXT.publicStudio.packageBooking;

type Props = {
  open: boolean;
  onClose: () => void;
  bundle: StudioBundleView;
  studioTimezone: string;
  /** The studio's masters with their enabled serviceIds (EXP-024). */
  masters: StudioMaster[];
};

type Placement = { masterProviderId: string; masterName: string; slot: SlotItem };
type ProposedComponent = {
  serviceId: string;
  name: string;
  masterProviderId: string;
  startAtUtc: string;
  endAtUtc: string;
  durationMin: number;
  discountedPrice: number;
};
type Proposal = { packageName: string; totalKopeks: number; components: ProposedComponent[] };
type Phase = "build" | "review" | "contacts" | "success";
type SessionUser = { displayName: string | null; phone: string | null };

export function StudioPackageFlow({ open, onClose, bundle, studioTimezone, masters }: Props) {
  const components = bundle.components;
  // LOGIC-09: ключ идемпотентности живёт весь визард — повтор сабмита обязан
  // вернуть тот же пакет, а не «это время занято».
  const idempotencyKeyRef = useRef<string>(
    typeof crypto !== "undefined" ? crypto.randomUUID() : `pkg-${Date.now()}`,
  );
  // LOGIC-26: дни визарда — в tz студии, а не посетителя (`studioTimezone`
  // здесь уже есть пропом; прежний `buildDays` его просто не использовал).
  const days = useMemo(() => buildDayOptions(14, studioTimezone), [studioTimezone]);

  const [phase, setPhase] = useState<Phase>("build");
  const [placements, setPlacements] = useState<Record<string, Placement>>({});

  // Active-component picker state.
  const [selectedMasterId, setSelectedMasterId] = useState("");
  const [selectedDay, setSelectedDay] = useState(days[0]?.key ?? todayKey(studioTimezone));
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const [proposing, setProposing] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [me, setMe] = useState<SessionUser | null>(null);
  // RKN-FIX-02 — guest consent (nothing pre-ticked).
  const [consent, setConsent] = useState<ConsentFlags>(EMPTY_CONSENT_FLAGS);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // GUEST-MANAGE-LINK: ссылка «Управлять записью» на весь пакет — только гостю.
  const [manageUrl, setManageUrl] = useState<string | null>(null);

  const fmtTime = useCallback(
    (iso: string) => UI_FMT.timeShort(iso, { timeZone: studioTimezone }),
    [studioTimezone],
  );
  const masterName = useCallback(
    (id: string) => masters.find((m) => m.id === id)?.name ?? "",
    [masters],
  );

  // The first not-yet-placed component (in sortOrder) is the active one.
  const activeIndex = useMemo(
    () => components.findIndex((c) => !placements[c.serviceId]),
    [components, placements],
  );
  const activeComponent = activeIndex >= 0 ? components[activeIndex] ?? null : null;
  const allPlaced = activeIndex === -1;

  // Sequential along the CLIENT timeline: the active component's slots must
  // start at/after the previous component's end (gaps allowed).
  //
  // PACKAGE-STUDIO-SAME-MASTER-BUFFER: a flat `prevEnd` cursor is only right
  // when the next component's master DIFFERS from the previous ones (the
  // by-client guard `intraPackageOverlapMultiMaster` applies buffer 0 there).
  // When the client picks the SAME master again, the guard demands that
  // master's between-bookings buffer as a gap — so the cursor is the
  // buffer-aware earliest start over every already-placed component of that
  // master (not just the adjacent one: an A-B-A pattern re-triggers the 409
  // through the non-adjacent pair). Depends on `selectedMasterId`: picking a
  // different master relaxes the cursor back to `prevEnd`.
  const cursorMs = useMemo(() => {
    if (activeIndex <= 0) return null;
    const prev = components[activeIndex - 1];
    if (!prev) return null;
    const placement = placements[prev.serviceId];
    if (!placement) return null;
    const prevEnd = new Date(placement.slot.endAtUtc);
    if (!selectedMasterId) return prevEnd.getTime();
    const selectedBufferMin = masters.find((m) => m.id === selectedMasterId)?.bufferMin ?? 0;
    const placed: StudioPlacedComponent[] = [];
    for (let i = 0; i < activeIndex; i += 1) {
      const c = components[i];
      const p = c ? placements[c.serviceId] : undefined;
      if (p) {
        placed.push({
          masterProviderId: p.masterProviderId,
          endAtUtc: new Date(p.slot.endAtUtc),
        });
      }
    }
    return studioNextComponentEarliestStart({
      prevEndAtUtc: prevEnd,
      placed,
      masterProviderId: selectedMasterId,
      masterBufferMin: selectedBufferMin,
    }).getTime();
  }, [activeIndex, components, placements, selectedMasterId, masters]);

  // Masters who actually perform the active component's service (EXP-024).
  const assignedMasters = useMemo(() => {
    if (!activeComponent) return [];
    return masters.filter((m) => (m.serviceIds ?? []).includes(activeComponent.serviceId));
  }, [activeComponent, masters]);

  // Reset everything when the modal closes.
  useEffect(() => {
    if (!open) {
      setPhase("build");
      setPlacements({});
      setSelectedMasterId("");
      setSelectedDay(days[0]?.key ?? todayKey(studioTimezone));
      setProposal(null);
      setError(null);
      setComment("");
    }
  }, [open, days, studioTimezone]);

  // Session prefill.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const user = await fetchBookingMe();
      if (cancelled || !user) return;
      setMe({ displayName: user.displayName, phone: user.phone });
      if (user.displayName) setName((prev) => prev || user.displayName!.trim());
      if (user.phone) setPhone((prev) => prev || user.phone!);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Fetch the chosen master's slots for the active component + day.
  useEffect(() => {
    if (!open || phase !== "build" || !activeComponent || !selectedMasterId || !selectedDay) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    setSlotsError(null);
    (async () => {
      const result = await fetchMasterAvailability(
        selectedMasterId,
        activeComponent.serviceId,
        selectedDay,
      );
      if (cancelled) return;
      if (!result.ok) {
        setSlots([]);
        setSlotsError(T.slotsError);
      } else {
        // Only slots that start at/after the running client cursor.
        const filtered = cursorMs
          ? result.slots.filter((s) => new Date(s.startAtUtc).getTime() >= cursorMs)
          : result.slots;
        setSlots(filtered);
      }
      setSlotsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, phase, activeComponent, selectedMasterId, selectedDay, cursorMs]);

  const pickSlot = useCallback(
    (slot: SlotItem) => {
      if (!activeComponent || !selectedMasterId) return;
      setPlacements((prev) => ({
        ...prev,
        [activeComponent.serviceId]: {
          masterProviderId: selectedMasterId,
          masterName: masterName(selectedMasterId),
          slot,
        },
      }));
      setSelectedMasterId("");
      setSelectedDay(days[0]?.key ?? todayKey(studioTimezone));
      setError(null);
    },
    [activeComponent, selectedMasterId, masterName, days, studioTimezone],
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
      setSelectedMasterId("");
      setSelectedDay(days[0]?.key ?? todayKey(studioTimezone));
      setError(null);
    },
    [components, days, studioTimezone],
  );

  const buildSelections = useCallback(
    () =>
      components.map((c) => {
        const placement = placements[c.serviceId]!;
        return {
          serviceId: c.serviceId,
          masterProviderId: placement.masterProviderId,
          startAtUtc: placement.slot.startAtUtc,
        };
      }),
    [components, placements],
  );

  const toReview = useCallback(async () => {
    if (!allPlaced) return;
    setProposing(true);
    setError(null);
    try {
      const proposed = await fetchJson<Proposal>(
        `/api/public/packages/${encodeURIComponent(bundle.id)}/studio/propose`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selections: buildSelections() }),
        },
      );
      setProposal(proposed);
      setPhase("review");
    } catch (error) {
      setError(
        error instanceof ApiClientError ? serverMessageOr(error, T.proposeError) : T.networkError,
      );
    } finally {
      setProposing(false);
    }
  }, [allPlaced, bundle.id, buildSelections]);

  const handleConfirm = useCallback(async () => {
    if (!proposal) return;
    const trimmedName = name.trim() || me?.displayName?.trim() || "";
    // BOOKING-AUTH-NO-PHONE-01: у вошедшего по почте/VK/Яндексу телефона в
    // профиле нет (вход по телефону в проде выключен) — берём введённый.
    const trimmedPhone = (me?.phone || phone).trim();
    if (!trimmedName) {
      setError(T.nameRequired);
      return;
    }
    if (trimmedPhone.replace(/\D/g, "").length < 10) {
      setError(T.phoneInvalid);
      return;
    }
    // RKN-FIX-02 — guests must have consented; mirrors the server check.
    if (!me && !hasRequiredConsents(consent)) {
      setError(UI_TEXT.auth.loginPage.consentRequired);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetchRetryingDuplicates(`/api/public/packages/${encodeURIComponent(bundle.id)}/studio/book`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // LOGIC-09 (инв. #28): без ключа повторный сабмит упирался в уже
          // созданные сиблинги и отвечал «Это время уже занято» — пакет при
          // этом был создан. Ключ живёт на весь визард, как в одиночном флоу.
          "x-idempotency-key": idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          clientName: trimmedName,
          clientPhone: trimmedPhone,
          comment: comment.trim() || null,
          selections: buildSelections(),
          consent: me ? undefined : consent,
        }),
      });
      const created = await readApiResponse<{ manageUrl?: string | null } | undefined>(res);
      setManageUrl(created?.manageUrl ?? null);
      setPhase("success");
    } catch (error) {
      if (!(error instanceof ApiClientError)) {
        setError(T.networkError);
        return;
      }
      setError(serverMessageOr(error, T.bookError));
      // A conflict means a placement went stale — send the client back to rebuild.
      // LOGIC-10: 409 `DUPLICATE_REQUEST` — это «тот же запрос ещё
      // выполняется», а не устаревшее размещение. Отправлять клиента
      // пересобирать пакет, который, скорее всего, уже создан, — ровно та
      // ложь, из-за которой одиночный флоу показывал «время занято».
      if (error.status === 409 && error.code !== "DUPLICATE_REQUEST") {
        setPhase("build");
        setProposal(null);
      }
    } finally {
      setSubmitting(false);
    }
    // `consent` must be in the deps — a stale closure would submit the initial
    // all-false flags and the server would refuse every guest booking.
  }, [bundle.id, buildSelections, comment, consent, me, name, phone, proposal]);

  if (components.length === 0) return null;

  return (
    <ModalSurface open={open} onClose={onClose} title={bundle.name} size="lg">
      {phase === "build" ? (
        <div className="space-y-4">
          <p className="text-sm text-text-sec">{T.buildHint}</p>

          <ol className="space-y-2">
            {components.map((component, index) => {
              const placement = placements[component.serviceId];
              const isActive = index === activeIndex;
              if (placement) {
                return (
                  <li
                    key={component.serviceId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/5 px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-success-text">
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-text-main">{component.name}</div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-sec">
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3 w-3" aria-hidden />
                            {placement.masterName}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden />
                            {fmtTime(placement.slot.startAtUtc)}–{fmtTime(placement.slot.endAtUtc)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button variant="wrapper"
                      onClick={() => changeFrom(index)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-sec transition hover:text-text-main"
                    >
                      <Pencil className="h-3 w-3" aria-hidden /> {T.change}
                    </Button>
                  </li>
                );
              }
              if (!isActive) {
                return (
                  <li
                    key={component.serviceId}
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
              // Active component — the picker.
              return (
                <li
                  key={component.serviceId}
                  className="rounded-xl border border-primary/40 bg-primary/5 p-3"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-accent-text">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-text-main">{component.name}</div>
                      <div className="text-xs text-text-sec">
                        {T.componentLabel
                          .replace("{index}", String(index + 1))
                          .replace("{total}", String(components.length))}
                      </div>
                    </div>
                  </div>

                  {assignedMasters.length === 0 ? (
                    <p className="py-3 text-center text-sm text-text-sec">{T.noMasters}</p>
                  ) : (
                    <>
                      <div className="mb-1 text-xs text-text-sec">{T.pickMaster}</div>
                      <div className="mb-3 flex flex-wrap gap-2">
                        {assignedMasters.map((master) => (
                          <Button variant="wrapper" aria-pressed={selectedMasterId === master.id}
                            key={master.id}
                            onClick={() => setSelectedMasterId(master.id)}
                            className={`rounded-full border px-3 py-1.5 text-xs transition ${
                              selectedMasterId === master.id
                                ? "border-primary bg-primary/10 text-accent-text"
                                : "border-border-subtle text-text-sec hover:border-primary/60"
                            }`}
                          >
                            {master.name}
                          </Button>
                        ))}
                      </div>

                      {selectedMasterId ? (
                        <>
                          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                            {days.map((d) => (
                              <Button variant="wrapper" aria-pressed={selectedDay === d.key}
                                key={d.key}
                                onClick={() => setSelectedDay(d.key)}
                                className={`shrink-0 rounded-xl border px-3 py-2 text-xs transition ${
                                  selectedDay === d.key
                                    ? "border-primary bg-primary/10 text-accent-text"
                                    : "border-border-subtle text-text-sec hover:border-primary/60"
                                }`}
                              >
                                {d.label}
                              </Button>
                            ))}
                          </div>
                          {slotsLoading ? (
                            <div className="py-5 text-center text-sm text-text-sec">{T.slotsLoading}</div>
                          ) : slotsError ? (
                            <div className="py-5 text-center text-sm text-danger-text">{slotsError}</div>
                          ) : slots.length === 0 ? (
                            <div className="py-5 text-center text-sm text-text-sec">{T.noSlots}</div>
                          ) : (
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                              {slots.map((slot) => (
                                <Button variant="wrapper"
                                  key={slot.startAtUtc}
                                  onClick={() => pickSlot(slot)}
                                  className="rounded-xl border border-border-subtle px-2 py-2 text-sm text-text-main transition hover:border-primary/60"
                                >
                                  {fmtTime(slot.startAtUtc)}
                                </Button>
                              ))}
                            </div>
                          )}
                        </>
                      ) : null}
                    </>
                  )}
                </li>
              );
            })}
          </ol>

          {error ? <p className="text-sm text-danger-text">{error}</p> : null}

          {allPlaced ? (
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={proposing}
              onClick={() => void toReview()}
            >
              {proposing ? T.proposing : T.toReview}
            </Button>
          ) : null}
          <p className="text-2xs text-text-sec/80">{T.priceNote}</p>
        </div>
      ) : null}

      {phase === "review" && proposal ? (
        <div className="space-y-4">
          <Button variant="wrapper"
            onClick={() => setPhase("build")}
            className="inline-flex items-center gap-1 text-xs text-text-sec hover:text-text-main"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {T.back}
          </Button>
          <ul className="space-y-2">
            {proposal.components.map((c, i) => (
              <li
                key={`${c.serviceId}-${i}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-bg-card/60 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-text-main">{c.name}</div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-sec">
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" aria-hidden />
                      {masterName(c.masterProviderId)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" aria-hidden />
                      {fmtTime(c.startAtUtc)}–{fmtTime(c.endAtUtc)}
                    </span>
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
          {error ? <p className="text-sm text-danger-text">{error}</p> : null}
          <Button variant="primary" size="lg" className="w-full" onClick={() => setPhase("contacts")}>
            {T.continue}
          </Button>
        </div>
      ) : null}

      {phase === "contacts" && proposal ? (
        <div className="space-y-4">
          <Button variant="wrapper"
            onClick={() => setPhase("review")}
            className="inline-flex items-center gap-1 text-xs text-text-sec hover:text-text-main"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {T.back}
          </Button>
          {!me ? (
            <>
              <label className="block text-sm">
                <FieldLabel tone="muted" className="text-sm font-normal">{T.nameLabel}</FieldLabel>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={T.namePlaceholder}
                />
                {/* FIX-NAME-HINT: общий ключ на все поверхности записи. */}
                <span className="mt-1 block text-xs text-text-sec">
                  {UI_TEXT.common.ownNameHint}
                </span>
              </label>
              <label className="block text-sm">
                <FieldLabel tone="muted" className="text-sm font-normal">{T.phoneLabel}</FieldLabel>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={T.phonePlaceholder} inputMode="tel" />
              </label>
            </>
          ) : (
            <div className="rounded-xl border border-border-subtle bg-bg-input/60 px-3 py-2 text-sm text-text-sec">
              {T.bookingAs.replace("{name}", me.displayName ?? name)}
            </div>
          )}
          {/* BOOKING-AUTH-NO-PHONE-01: вошедший без телефона в профиле — см.
              `package-booking-flow.tsx`. */}
          {me && !me.phone ? (
            <label className="block text-sm">
              <FieldLabel tone="muted" className="text-sm font-normal">{T.phoneLabel}</FieldLabel>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={T.phonePlaceholder} inputMode="tel" />
            </label>
          ) : null}
          {/* RKN-FIX-02 — guest consent per purpose (server-enforced). */}
          {!me ? <LegalConsentGroup compact value={consent} onChange={setConsent} /> : null}
          <label className="block text-sm">
            <FieldLabel tone="muted" className="text-sm font-normal">{T.commentLabel}</FieldLabel>
            <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={T.commentPlaceholder} />
          </label>
          <div className="flex items-center justify-between border-t border-border-subtle pt-3">
            <span className="text-sm text-text-sec">{T.total}</span>
            <span className="font-display text-lg text-text-main">{UI_FMT.priceLabel(proposal.totalKopeks)}</span>
          </div>
          {error ? <p className="text-sm text-danger-text">{error}</p> : null}
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
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success-text">
            <Sparkles className="h-6 w-6" aria-hidden />
          </div>
          <div className="font-display text-xl text-text-main">{T.successTitle}</div>
          <p className="text-sm text-text-sec">{T.successBody}</p>
          {manageUrl ? <GuestManageLinkCard manageUrl={manageUrl} /> : null}
          <Button variant="secondary" size="md" onClick={onClose}>
            {T.close}
          </Button>
        </div>
      ) : null}
    </ModalSurface>
  );
}

/** CTA button that opens the studio multi-master package booking flow. */
export function StudioPackageBookingButton({
  bundle,
  studioTimezone,
  masters,
}: {
  bundle: StudioBundleView;
  studioTimezone: string;
  masters: StudioMaster[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" size="md" className="w-full" onClick={() => setOpen(true)}>
        <Package className="mr-1.5 h-4 w-4" aria-hidden strokeWidth={1.8} />
        {UI_TEXT.publicStudio.packages.bookCta}
      </Button>
      <StudioPackageFlow
        open={open}
        onClose={() => setOpen(false)}
        bundle={bundle}
        studioTimezone={studioTimezone}
        masters={masters}
      />
    </>
  );
}
