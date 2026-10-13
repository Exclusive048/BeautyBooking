"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import {
  createBooking,
  fetchBookingMe,
  fetchMasterAvailability,
  fetchStudioMasters,
  fetchStudioProfile,
  servicesPerformedBy,
  todayKey,
  type BookingUser,
  type SlotItem,
  type StudioMaster,
} from "@/features/booking/lib/studio-booking";
import {
  EMPTY_CONSENT_FLAGS,
  hasRequiredConsents,
  type ConsentFlags,
} from "@/lib/legal/consent-flags";
import {
  fetchPublicServiceBookingConfig,
  uploadBookingReference,
  type ServiceBookingConfig,
} from "@/features/booking/lib/booking-config";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import { SCHEDULE_HORIZON_DAYS } from "@/lib/schedule/publish-horizon";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import { formatZoneLabel, zonesDifferForViewer } from "@/lib/ui/zone-label";
import { studioBookingUrl } from "@/lib/public-urls";
import { scrollBehavior } from "@/lib/ui/scroll";
import { BookingHero } from "./components/booking-hero";
import { StepsBar, type WizardStep } from "./components/steps-bar";
import { StepTransition } from "./components/step-transition";
import { ServiceStep } from "./components/steps/service-step";
import { MasterStep, ANY_MASTER_ID } from "./components/steps/master-step";
import { WhenStep } from "./components/steps/when-step";
import { YouStep } from "./components/steps/you-step";
import { BookingSummary } from "./components/booking-summary";
import { BookingError } from "./components/booking-error";
import { mergeAnyMasterSlots } from "./any-master-slots";
import { GuestManageLinkCard } from "@/features/booking/components/guest-manage-link-card";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { FieldLabel } from "@/components/ui/field-label";
import { ModalSurface } from "@/components/ui/modal-surface";

type MasterAvailability = {
  serviceAvailable: boolean;
  slots: SlotItem[];
  error?: string;
};

type Props = {
  studioId: string;
  initialMasterId?: string;
  initialMasterKey?: string;
  initialServiceId?: string;
  /**
   * BOOKING-WIDGET-DIALOG: мастер записи в окне поверх страницы студии
   * (кнопки «Записаться» профиля). Без него — отдельная страница
   * `/u/[студия]/booking` для прямых ссылок.
   */
  dialog?: { open: boolean; onClose: () => void };
};

const STEP_ORDER: readonly WizardStep[] = ["service", "master", "when", "you"];

function buildLoginUrl(nextPath: string): string {
  const params = new URLSearchParams({ next: nextPath });
  return `/login?${params.toString()}`;
}

function formatDateLabel(dateKey: string): string {
  return UI_FMT.dateKey(dateKey, "weekdayDayMonthShort");
}

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `bk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function StudioBookingFlow({ studioId, initialMasterId, initialMasterKey, initialServiceId, dialog }: Props) {
  const viewerTimeZone = useViewerTimeZoneContext();
  const [studio, setStudio] = useState<ProviderProfileDto | null>(null);
  const [masters, setMasters] = useState<StudioMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // LOGIC-26: при монтировании tz салона ещё не загружена — берём зону
  // зрителя как единственное, что известно, и пересчитываем ниже, как только
  // придёт профиль. К этому моменту выбрать дату пользователь не мог: полоса
  // дней живёт за шагом «когда», а виджет до конца загрузки в состоянии
  // `loading`.
  const [selectedDate, setSelectedDate] = useState(() => todayKey(viewerTimeZone));
  const [serviceId, setServiceId] = useState(initialServiceId ?? "");
  const [masterId, setMasterId] = useState(initialMasterId ?? "");
  const [slotLabel, setSlotLabel] = useState("");
  const [availabilityByMaster, setAvailabilityByMaster] = useState<Record<string, MasterAvailability>>({});
  // UX-PASS-01: перезапрос окошек без смены даты — «Повторить» после сбоя
  // загрузки и обновление после «это время уже занято».
  const [availabilityNonce, setAvailabilityNonce] = useState(0);

  const [me, setMe] = useState<BookingUser | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [silentMode, setSilentMode] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  // RKN-FIX-02 — guest consent (nothing pre-ticked); signed-in clients never
  // see it and never send it.
  const [consent, setConsent] = useState<ConsentFlags>(EMPTY_CONSENT_FLAGS);
  const [bookingConfig, setBookingConfig] = useState<ServiceBookingConfig | null>(null);
  const [bookingConfigLoading, setBookingConfigLoading] = useState(false);
  const [bookingConfigError, setBookingConfigError] = useState<string | null>(null);
  const [referencePhotoAssetId, setReferencePhotoAssetId] = useState<string | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [referenceUploadError, setReferenceUploadError] = useState<string | null>(null);
  const [bookingAnswers, setBookingAnswers] = useState<Record<string, string>>({});

  const [submitLoading, setSubmitLoading] = useState(false);
  // Инв. #28: один ключ на попытку записи — повтор той же отправки сервер
  // узнаёт; после отказа ключ меняется, чтобы новая попытка не считалась дублем.
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey());
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitErrorCode, setSubmitErrorCode] = useState<string | null>(null);
  // GUEST-MANAGE-LINK: `manageUrl` — ссылка «Управлять записью», только гостю.
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const focusAnchorRef = useRef<HTMLDivElement>(null);

  // Scenario: B if a master is locked in (initial param or single-master prefill);
  // A otherwise (studio-wide). FOUNDATION already wired ?master= parsing.
  const isScenarioB = Boolean(initialMasterId || initialMasterKey);
  // BOOKING-WIDGET-DIALOG: услуга уже выбрана («Записаться» у услуги, ссылка
  // из каталога) — шаг услуги пройден, мастер записи открывается со следующего.
  const [step, setStep] = useState<WizardStep>(() =>
    initialServiceId ? (isScenarioB ? "when" : "master") : "service",
  );
  const [direction, setDirection] = useState<1 | -1>(1);

  const selectedService = useMemo(
    () => studio?.services.find((service) => service.id === serviceId) ?? null,
    [serviceId, studio?.services],
  );

  // EXP-024: masters who actually perform the selected service (enabled
  // MasterService). Drives both the picker and the availability fetch, so
  // unassigned masters are never listed and never probed for slots (no more
  // 5× 409 SERVICE_INVALID per service pick + no dead-end picker option).
  const assignedMasters = useMemo(() => {
    if (!serviceId) return masters;
    return masters.filter((master) => (master.serviceIds ?? []).includes(serviceId));
  }, [masters, serviceId]);

  const availableMasters = useMemo(() => {
    if (!serviceId) return assignedMasters;
    return assignedMasters.filter((master) => availabilityByMaster[master.id]?.serviceAvailable !== false);
  }, [assignedMasters, availabilityByMaster, serviceId]);

  // BOOKING-FLOW-AUDIT-RESIDUALS: «Любой мастер» — ОБЪЕДИНЕНИЕ окошек всех
  // мастеров услуги. Раньше показывались окошки только первого мастера, у
  // которого они были, и время, свободное лишь у второго, клиенту не
  // предлагалось. Окошко помнит мастера (первого по порядку, у кого оно есть) —
  // запись уходит к нему.
  const anyMasterSlots = useMemo(
    () =>
      masterId === ANY_MASTER_ID && serviceId
        ? mergeAnyMasterSlots(availableMasters, availabilityByMaster)
        : null,
    [availabilityByMaster, availableMasters, masterId, serviceId],
  );

  const resolvedMasterId = useMemo(() => {
    if (masterId && masterId !== ANY_MASTER_ID) return masterId;
    if (anyMasterSlots) {
      const owner = slotLabel ? anyMasterSlots.find((entry) => entry.slot.label === slotLabel) : undefined;
      return owner?.masterId ?? anyMasterSlots[0]?.masterId ?? "";
    }
    return "";
  }, [anyMasterSlots, masterId, slotLabel]);

  // 29.09 доработки · 03: полоса дат — окно записи студии и мастера. Для
  // выбранного мастера — меньшее из двух; для «Любой мастер» — студия и
  // самый дальний горизонт среди мастеров услуги (окошко уйдёт тому, у кого
  // оно есть). У мастера без поля ограничивает только студия.
  const horizonDays = useMemo(() => {
    const studioDays = studio?.bookingHorizonDays ?? SCHEDULE_HORIZON_DAYS;
    const masterDays = (master: StudioMaster) => master.bookingHorizonDays ?? studioDays;
    if (masterId && masterId !== ANY_MASTER_ID) {
      const selected = masters.find((master) => master.id === masterId);
      return selected ? Math.min(studioDays, masterDays(selected)) : studioDays;
    }
    if (availableMasters.length === 0) return studioDays;
    return Math.min(studioDays, Math.max(...availableMasters.map(masterDays)));
  }, [availableMasters, masterId, masters, studio]);

  const slots = useMemo(() => {
    if (anyMasterSlots) return anyMasterSlots.map((entry) => entry.slot);
    return resolvedMasterId ? availabilityByMaster[resolvedMasterId]?.slots ?? [] : [];
  }, [anyMasterSlots, availabilityByMaster, resolvedMasterId]);
  const slotByLabel = useMemo(() => new Map(slots.map((slot) => [slot.label, slot])), [slots]);
  // UX-PASS-01: сбой загрузки окошек — не «свободных окошек нет». Раньше
  // ошибка мастера лежала в `availabilityByMaster` и не доходила до шага
  // «Когда»: человек видел «на эту дату свободных окошек нет» и уходил.
  // «Любой мастер»: окошек нет ни у кого, а хоть у одного — сбой.
  const slotsError = useMemo(() => {
    if (slots.length > 0) return null;
    if (anyMasterSlots) {
      const failed = availableMasters.find((master) => availabilityByMaster[master.id]?.error);
      return failed ? availabilityByMaster[failed.id]?.error ?? null : null;
    }
    return resolvedMasterId ? availabilityByMaster[resolvedMasterId]?.error ?? null : null;
  }, [anyMasterSlots, availabilityByMaster, availableMasters, resolvedMasterId, slots.length]);
  const selectedSlot = slotLabel ? slotByLabel.get(slotLabel) ?? null : null;

  // FIX-BATCH-C Defect 1 (QA-107/FIX-22): slot times are shown in the SALON's
  // timezone (a booking happens at the salon's local clock), never silently
  // converted to the client's browser zone. `salonTz` drives every time display
  // below; the «(город, GMT+N)» label (shown when the viewer's zone differs) is
  // computed with the same shared `zone-label` primitive the bookings list uses.
  const salonTz = studio?.timezone ?? viewerTimeZone;
  const selectedSlotZoneLabel =
    selectedSlot &&
    zonesDifferForViewer({ iso: selectedSlot.startAtUtc, salonTimeZone: salonTz, viewerTimeZone })
      ? formatZoneLabel({ iso: selectedSlot.startAtUtc, timeZone: salonTz })
      : "";

  // Мастер из ссылки — по id либо по адресу страницы. Раньше адрес без id
  // не читался вовсе (сценарий «к мастеру» без его услуг и шапки).
  const prefilledMaster = useMemo(() => {
    const byId = initialMasterId ? masters.find((m) => m.id === initialMasterId) : undefined;
    if (byId) return byId;
    const key = initialMasterKey?.trim().toLowerCase();
    return key ? masters.find((m) => m.publicUsername?.toLowerCase() === key) ?? null : null;
  }, [initialMasterId, initialMasterKey, masters]);

  // Goto helpers
  const goNext = useCallback(
    (from: WizardStep) => {
      setDirection(1);
      if (from === "service") setStep(isScenarioB ? "when" : "master");
      else if (from === "master") setStep("when");
      else if (from === "when") setStep("you");
    },
    [isScenarioB],
  );
  const goBack = useCallback(
    (from: WizardStep) => {
      setDirection(-1);
      if (from === "you") setStep("when");
      else if (from === "when") setStep(isScenarioB ? "service" : "master");
      else if (from === "master") setStep("service");
    },
    [isScenarioB],
  );
  const goTo = useCallback(
    (target: WizardStep) => {
      setDirection(STEP_ORDER.indexOf(target) >= STEP_ORDER.indexOf(step) ? 1 : -1);
      setStep(target);
    },
    [step],
  );

  // В окне новый шаг — с начала: после выбора услуги внизу длинного списка
  // следующий шаг открывался прокрученным до середины.
  const prevStepRef = useRef(step);
  useEffect(() => {
    if (prevStepRef.current === step) return;
    prevStepRef.current = step;
    if (!dialog) return;
    const scroller = focusAnchorRef.current?.closest('[role="dialog"]');
    if (scroller && scroller.scrollTop > 0) scroller.scrollTo({ top: 0, behavior: scrollBehavior() });
  }, [dialog, step]);

  // В окне на странице студии вход возвращает на страницу записи с той же
  // услугой и мастером — иначе после входа окно пришлось бы собирать заново.
  // Пока профиль студии грузится, её адреса ещё нет — ссылку на вход до этого
  // момента не показывают, а сборка по id сообщала бы о пропавшем адресе.
  const nextPath =
    typeof window !== "undefined" && !dialog
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : studio
        ? studioBookingUrl(
            { id: studioId, publicUsername: studio.publicUsername ?? null },
            dialog
              ? {
                  serviceId: serviceId || undefined,
                  masterId: masterId && masterId !== ANY_MASTER_ID ? masterId : undefined,
                }
              : undefined,
            "studio-booking-flow",
          ) ?? "#"
        : "#";
  const loginHref = buildLoginUrl(nextPath);
  const studioBackHref = studio?.publicUsername ? `/u/${studio.publicUsername}` : `/u/${studioId}`;

  // --- effects (logic preserved from FOUNDATION) -----------------------------

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const [profileRes, mastersRes] = await Promise.all([fetchStudioProfile(studioId), fetchStudioMasters(studioId)]);
        if (!profileRes.ok) throw new Error(profileRes.error);
        if (profileRes.provider.type !== "STUDIO") throw new Error(UI_TEXT.publicStudio.studioOnlyProfileError);
        if (cancelled) return;
        setStudio(profileRes.provider);
        // LOGIC-26: день по умолчанию — «сегодня» САЛОНА. Клиент из
        // Калининграда (+2), открывающий екатеринбургскую студию (+5) поздно
        // вечером, иначе видел выдачу на вчерашний по меркам салона день.
        setSelectedDate(todayKey(profileRes.provider.timezone));
        setMasters(mastersRes.ok ? mastersRes.masters : []);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : UI_TEXT.publicStudio.bookingError);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studioId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMeLoading(true);
      try {
        const currentUser = await fetchBookingMe();
        if (!cancelled) setMe(currentUser);
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSlotLabel("");
  }, [serviceId]);

  // Услуга из ссылки, которой у студии (или у мастера из ссылки) нет, —
  // назад к выбору услуги, а не тупик «нет окошек».
  useEffect(() => {
    if (!studio || !serviceId) return;
    if (isScenarioB && !prefilledMaster && masters.length > 0) return;
    const allowed = servicesPerformedBy(studio.services, prefilledMaster);
    if (!allowed.some((service) => service.id === serviceId)) {
      setServiceId("");
      setDirection(-1);
      setStep("service");
    }
  }, [isScenarioB, masters.length, prefilledMaster, serviceId, studio]);

  // Fetch availability per master when service or date changes.
  // EXP-024: only assigned masters — no probing (and no 409s) for masters
  // who don't perform the service.
  useEffect(() => {
    if (!serviceId || assignedMasters.length === 0) {
      setAvailabilityByMaster({});
      return;
    }
    let cancelled = false;
    const unavailableCodes = new Set(["SERVICE_INVALID", "SERVICE_DISABLED", "SERVICE_NOT_FOUND"]);
    (async () => {
      setLoadingSlots(true);
      try {
        const results = await Promise.all(
          assignedMasters.map(async (master) => ({
            id: master.id,
            result: await fetchMasterAvailability(master.id, serviceId, selectedDate),
          })),
        );
        if (cancelled) return;
        const next: Record<string, MasterAvailability> = {};
        for (const entry of results) {
          if (entry.result.ok) {
            next[entry.id] = { serviceAvailable: true, slots: entry.result.slots };
            continue;
          }
          if (unavailableCodes.has(entry.result.code ?? "")) {
            next[entry.id] = { serviceAvailable: false, slots: [] };
            continue;
          }
          next[entry.id] = { serviceAvailable: true, slots: [], error: entry.result.error };
        }
        setAvailabilityByMaster(next);
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignedMasters, availabilityNonce, selectedDate, serviceId]);

  // If service has a config (questions / reference photo) — load it
  useEffect(() => {
    if (!serviceId) {
      setBookingConfig(null);
      setBookingConfigError(null);
      setBookingAnswers({});
      setReferencePhotoAssetId(null);
      setReferencePreviewUrl(null);
      setReferenceUploadError(null);
      setReferenceUploading(false);
      setBookingConfigLoading(false);
      return;
    }
    let cancelled = false;
    setBookingConfigLoading(true);
    setBookingConfigError(null);
    setBookingAnswers({});
    setReferencePhotoAssetId(null);
    setReferencePreviewUrl(null);
    setReferenceUploadError(null);
    setReferenceUploading(false);
    (async () => {
      try {
        const config = await fetchPublicServiceBookingConfig(serviceId);
        if (!cancelled) setBookingConfig(config);
      } catch {
        if (!cancelled) {
          setBookingConfig(null);
          setBookingConfigError(UI_TEXT.publicProfile.booking.bookingConfigLoadFailed);
        }
      } finally {
        if (!cancelled) setBookingConfigLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  useEffect(() => {
    return () => {
      if (referencePreviewUrl) URL.revokeObjectURL(referencePreviewUrl);
    };
  }, [referencePreviewUrl]);

  // Master prefill via initialMasterKey when masters arrive
  useEffect(() => {
    if (!masters.length) return;
    if (masterId && masterId !== ANY_MASTER_ID) {
      const exists = masters.some((master) => master.id === masterId);
      if (!exists) setMasterId("");
      return;
    }
    if (!masterId && initialMasterKey) {
      const normalized = initialMasterKey.trim().toLowerCase();
      const match = masters.find((master) => master.publicUsername?.toLowerCase() === normalized);
      if (match) setMasterId(match.id);
    }
  }, [initialMasterKey, masterId, masters]);

  // If selected slot disappears, reset
  // UX-PASS-01: и когда окошек не осталось вовсе (другой мастер, у которого
  // этот день пуст). Прежний ранний выход на пустом списке оставлял выбранное
  // время чужого мастера: шаг «Когда» значился пройденным, а запись падала на
  // «Выберите время». Пока окошки грузятся — не судим.
  useEffect(() => {
    if (loadingSlots) return;
    if (slotLabel && !slots.some((slot) => slot.label === slotLabel)) {
      setSlotLabel("");
    }
  }, [loadingSlots, slots, slotLabel]);

  // --- handlers --------------------------------------------------------------

  async function handleReferenceUpload(file: File) {
    setReferenceUploadError(null);
    setReferenceUploading(true);
    setReferencePhotoAssetId(null);
    setReferencePreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    const result = await uploadBookingReference(file);
    if (!result.ok) {
      setReferenceUploadError(result.error);
      setReferencePhotoAssetId(null);
    } else {
      setReferencePhotoAssetId(result.assetId);
    }
    setReferenceUploading(false);
  }

  const isGuest = !meLoading && !me;
  // RKN-FIX-02: for a guest, "contacts ready" now includes the two required
  // consents — the same condition the server enforces, so the CTA never
  // promises a booking the API will refuse.
  const guestValid =
    guestName.trim().length > 0 && guestPhone.trim().length > 0 && hasRequiredConsents(consent);
  // BOOKING-AUTH-NO-PHONE-01: вошедший без телефона в профиле (почта/VK/Яндекс —
  // вход по телефону в проде выключен) вводит номер тем же полем, что и гость.
  const authNeedsPhone = !!me && !me.phone;
  const contactsReady = isGuest
    ? guestValid
    : !!me && (!authNeedsPhone || guestPhone.trim().length > 0);

  const done = useMemo<ReadonlySet<WizardStep>>(() => {
    const set = new Set<WizardStep>();
    if (serviceId) set.add("service");
    if (masterId || isScenarioB) set.add("master");
    if (slotLabel) set.add("when");
    if (contactsReady) set.add("you");
    return set;
  }, [serviceId, masterId, slotLabel, contactsReady, isScenarioB]);

  const statusLabel = useMemo(() => {
    if (!serviceId) return UI_TEXT.bookingWidget.summary.badgeService;
    if (!masterId && !isScenarioB) return UI_TEXT.bookingWidget.summary.badgeMaster;
    if (!slotLabel) return UI_TEXT.bookingWidget.summary.badgeWhen;
    if (!contactsReady) return UI_TEXT.bookingWidget.summary.badgeYou;
    return UI_TEXT.bookingWidget.summary.badgeReady;
  }, [serviceId, masterId, slotLabel, contactsReady, isScenarioB]);

  async function onSubmit() {
    if (!studio || !selectedService || !resolvedMasterId || !slotLabel) return;
    const slot = slotByLabel.get(slotLabel) ?? null;
    if (!slot) {
      setSubmitError(UI_TEXT.publicStudio.selectSlotFirst);
      return;
    }

    setSubmitLoading(true);
    setSubmitError(null);
    setSubmitErrorCode(null);

    try {
      if (isGuest) {
        if (!guestName.trim()) {
          setSubmitError(UI_TEXT.publicStudio.guestNameRequired);
          setSubmitLoading(false);
          return;
        }
        if (!guestPhone.trim()) {
          setSubmitError(UI_TEXT.publicStudio.guestPhoneRequired);
          setSubmitLoading(false);
          return;
        }
        // RKN-FIX-02 — mirrors the server check; the CTA is already gated, this
        // is the belt for a stale click.
        if (!hasRequiredConsents(consent)) {
          setSubmitError(UI_TEXT.auth.loginPage.consentRequired);
          setSubmitLoading(false);
          return;
        }
      } else if (authNeedsPhone && !guestPhone.trim()) {
        setSubmitError(UI_TEXT.publicStudio.guestPhoneRequired);
        setSubmitLoading(false);
        return;
      }

      if (bookingConfig?.requiresReferencePhoto && !referencePhotoAssetId) {
        setSubmitError(UI_TEXT.publicProfile.booking.referencePhotoRequired);
        setSubmitLoading(false);
        return;
      }
      if (bookingConfig?.questions?.length) {
        const missing = bookingConfig.questions.some(
          (q) => q.required && !(bookingAnswers[q.id]?.trim() ?? ""),
        );
        if (missing) {
          setSubmitError(UI_TEXT.publicProfile.booking.requiredQuestions);
          setSubmitLoading(false);
          return;
        }
      }

      const answersPayload =
        bookingConfig?.questions
          ?.map((q) => {
            const value = bookingAnswers[q.id]?.trim() ?? "";
            if (!value) return null;
            return { questionId: q.id, questionText: q.text, answer: value };
          })
          .filter((item): item is { questionId: string; questionText: string; answer: string } => item !== null) ??
        null;

      const result = await createBooking({
        providerId: studio.id,
        serviceId: selectedService.id,
        masterProviderId: resolvedMasterId,
        startAtUtc: slot.startAtUtc,
        endAtUtc: slot.endAtUtc,
        slotLabel: slot.label,
        clientName: me?.displayName ?? (guestName.trim() || UI_TEXT.publicProfile.booking.clientFallbackName),
        clientPhone: me?.phone || guestPhone.trim(),
        comment: comment.trim() ? comment.trim() : null,
        silentMode,
        referencePhotoAssetId,
        bookingAnswers: answersPayload,
        // Guests only — the server refuses a guest booking without it.
        consent: isGuest ? consent : undefined,
      }, idempotencyKeyRef.current);

      if (!result.ok) {
        idempotencyKeyRef.current = newIdempotencyKey();
        setSubmitError(result.error || UI_TEXT.bookingWidget.errors.generic);
        setSubmitErrorCode(result.code ?? null);
        // UX-PASS-01: время заняли — назад к окошкам, со свежим списком и без
        // занятого: раньше человек оставался на «Вы» с тем же временем, и
        // повтор упирался в тот же отказ. Причина остаётся видна на шаге.
        if (result.code === "SLOT_CONFLICT" || result.code === "BOOKING_CONFLICT") {
          setSlotLabel("");
          setAvailabilityNonce((n) => n + 1);
          setDirection(-1);
          setStep("when");
        }
        return;
      }

      // Запись уже на конкретного мастера (при «Любой свободный» — того, у кого
      // было это окошко), и в итоге он назван по имени, а не «любой свободный».
      const masterName = masters.find((m) => m.id === resolvedMasterId)?.name ?? "";

      const successZoneLabel = zonesDifferForViewer({
        iso: slot.startAtUtc,
        salonTimeZone: salonTz,
        viewerTimeZone,
      })
        ? formatZoneLabel({ iso: slot.startAtUtc, timeZone: salonTz })
        : "";
      setSuccess({
        serviceName: selectedService.name,
        masterName,
        dateLabel: formatDateLabel(selectedDate),
        timeLabel: `${UI_FMT.timeShort(slot.startAtUtc, { timeZone: salonTz })}${
          successZoneLabel ? ` ${successZoneLabel}` : ""
        }`,
        manageUrl: result.manageUrl,
      });
    } catch {
      // UX-PASS-01: обрыв сети (`createBooking` бросает только его) раньше
      // уходил необработанным — кнопка просто переставала крутиться. Ключ
      // идемпотентности НЕ меняем: запрос мог дойти, и повтор с тем же ключом
      // вернёт уже созданную запись, а не вторую (инв. #28).
      setSubmitError(UI_TEXT.publicProfile.bookingWidget.errorNetwork);
      setSubmitErrorCode(null);
    } finally {
      setSubmitLoading(false);
    }
  }

  // --- rendering -------------------------------------------------------------

  // BOOKING-WIDGET-DIALOG: главная кнопка не бывает «мёртвой». Пройдены
  // услуга, мастер и время и открыт шаг «Вы» — «Записаться» (недостающие
  // контакты называет проверка в `onSubmit`); иначе — «Продолжить» к первому
  // незаполненному шагу. Раньше кнопка была выключена с «Заполните все шаги»,
  // и было непонятно, куда идти.
  const firstIncomplete: WizardStep = !serviceId
    ? "service"
    : !isScenarioB && !masterId
      ? "master"
      : !slotLabel
        ? "when"
        : "you";
  const canSubmitNow = firstIncomplete === "you" && step === "you";
  const ready = firstIncomplete === "you" && !!resolvedMasterId && contactsReady;
  const scrollToSteps = () => {
    if (!dialog) stepsRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  };
  const primaryAction: { label: string; onClick: () => void; disabled: boolean } | null = canSubmitNow
    ? {
        label: submitLoading ? UI_TEXT.bookingWidget.summary.submitting : UI_TEXT.bookingWidget.summary.submit,
        onClick: () => void onSubmit(),
        disabled: submitLoading || referenceUploading,
      }
    : firstIncomplete !== step
      ? {
          label: UI_TEXT.bookingWidget.summary.continue,
          onClick: () => {
            goTo(firstIncomplete);
            scrollToSteps();
          },
          disabled: false,
        }
      : dialog
        ? // В окне выбор на шаге сам ведёт дальше — кнопке здесь нечего делать.
          null
        : { label: UI_TEXT.bookingWidget.summary.continue, onClick: scrollToSteps, disabled: false };

  const selectedMasterName = resolvedMasterId ? masters.find((m) => m.id === resolvedMasterId)?.name ?? null : null;
  const selectedTimeLabel = selectedSlot ? UI_FMT.timeShort(selectedSlot.startAtUtc, { timeZone: salonTz }) : null;

  if (dialog) {
    const subtitle = studio
      ? prefilledMaster
        ? `${prefilledMaster.name} · ${studio.name}`
        : studio.name
      : undefined;
    const closeFooter = (
      <Button type="button" variant={success ? "primary" : "secondary"} onClick={dialog.onClose}>
        {UI_TEXT.common.close}
      </Button>
    );

    let body: ReactNode;
    let footer: ReactNode = null;
    if (loading) {
      body = <DialogSkeleton />;
    } else if (loadError || !studio) {
      body = (
        <div className="rounded-2xl border border-danger-border bg-danger-surface p-5 text-sm text-danger-text">
          {loadError ?? UI_TEXT.publicStudio.bookingError}
        </div>
      );
      footer = closeFooter;
    } else if (success) {
      body = <SuccessBody success={success} />;
      footer = closeFooter;
    } else {
      const summaryParts = [
        masterId === ANY_MASTER_ID ? UI_TEXT.bookingWidget.summary.anyMaster : selectedMasterName,
        selectedTimeLabel ? `${formatDateLabel(selectedDate)} · ${selectedTimeLabel}` : null,
        selectedService && selectedService.price > 0 ? UI_FMT.priceLabel(selectedService.price) : null,
      ].filter((part): part is string => Boolean(part));
      body = (
        <div ref={focusAnchorRef} tabIndex={-1} className="space-y-4 outline-none">
          <StepsBar active={step} done={done} scenarioB={isScenarioB} />
          {renderStepBody()}
          {step !== "you" ? renderError() : null}
        </div>
      );
      footer = (
        <div className="flex w-full min-w-0 items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-text-main">
              {selectedService?.name ?? statusLabel}
            </div>
            {summaryParts.length > 0 ? (
              <div className="truncate text-xs text-text-sec">{summaryParts.join(" · ")}</div>
            ) : null}
            {selectedSlotZoneLabel ? (
              <div className="truncate text-2xs text-accent-text">
                {UI_TEXT.bookingWidget.summary.salonTimeNote} {selectedSlotZoneLabel}
              </div>
            ) : null}
          </div>
          {primaryAction ? (
            <Button
              type="button"
              size="lg"
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
              className="shrink-0"
            >
              {primaryAction.label}
            </Button>
          ) : null}
        </div>
      );
    }

    return (
      <ModalSurface
        open={dialog.open}
        onClose={dialog.onClose}
        fullScreenOnMobile
        stickyFooter
        size="lg"
        header={{ title: UI_TEXT.bookingWidget.dialogTitle, subtitle }}
        // Без этого фокус встаёт в поиск услуг, и на телефоне клавиатура
        // закрывает список при открытии окна.
        initialFocusRef={focusAnchorRef}
        footer={footer}
      >
        {body}
      </ModalSurface>
    );
  }

  if (loading) {
    return <BookingFlowSkeleton />;
  }
  if (loadError || !studio) {
    return (
      <div className="rounded-2xl border border-danger-border bg-danger-surface p-6 text-sm text-danger-text">
        {loadError ?? UI_TEXT.publicStudio.bookingError}
      </div>
    );
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-6 sm:p-8">
        <SuccessBody success={success} />
        <a
          href={studioBackHref}
          className="mt-5 inline-flex rounded-xl bg-muted px-4 py-2 text-sm font-medium text-text hover:bg-muted/70"
        >
          {UI_TEXT.bookingWidget.success.backToStudio}
        </a>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      {/* min-w-0: let the wizard column shrink below content width so the
          service-step category filter-chip strip scrolls internally instead
          of forcing page-level horizontal overflow on mobile (WAVE-2-SMALL). */}
      <div className="min-w-0 space-y-4">
        <BookingHero
          studio={studio}
          masters={masters}
          prefilledMaster={prefilledMaster}
          backHref={studioBackHref}
        />

        <div ref={stepsRef} className="scroll-mt-24 space-y-4">
          <StepsBar active={step} done={done} scenarioB={isScenarioB} />

          <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 sm:p-6">{renderStepBody()}</div>
        </div>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <BookingSummary
          serviceName={selectedService?.name ?? null}
          masterName={selectedMasterName}
          isAnyMaster={masterId === ANY_MASTER_ID}
          dateLabel={selectedDate ? formatDateLabel(selectedDate) : null}
          timeLabel={selectedTimeLabel}
          zoneLabel={selectedSlotZoneLabel}
          totalKopeks={selectedService?.price ?? null}
          cancellationDeadlineHours={studio.cancellationDeadlineHours ?? null}
          ready={ready}
          actionLabel={primaryAction?.label ?? UI_TEXT.bookingWidget.summary.continue}
          actionDisabled={primaryAction?.disabled ?? false}
          onAction={primaryAction?.onClick ?? scrollToSteps}
          statusLabel={statusLabel}
        />
        {step !== "you" ? <div className="mt-3">{renderError()}</div> : null}
      </aside>
    </div>
  );

  function renderError() {
    return (
      <BookingError
        code={submitErrorCode}
        fallback={submitError ?? undefined}
        minBookingHoursAhead={null}
        maxBookingDaysAhead={null}
      />
    );
  }

  function renderStepBody() {
    if (!studio) return null;
    return (
      <>
        <StepTransition step={step} direction={direction}>
          {step === "service" ? (
            <ServiceStep
              services={studio.services}
              masters={masters}
              selectedServiceId={serviceId}
              prefilledMaster={prefilledMaster}
              onPick={(id) => {
                setServiceId(id);
                goNext("service");
              }}
            />
          ) : null}

          {step === "master" ? (
            <MasterStep
              masters={assignedMasters}
              availabilityByMaster={availabilityByMaster}
              selectedMasterId={masterId}
              selectedServiceName={selectedService?.name ?? ""}
              salonTimeZone={salonTz}
              onPick={(id) => {
                // UX-PASS-01: время выбирали у другого мастера — выбираем заново.
                if (id !== masterId) setSlotLabel("");
                setMasterId(id);
                goNext("master");
              }}
              onBack={() => goBack("master")}
            />
          ) : null}

          {step === "when" ? (
            <WhenStep
              slots={slots}
              loading={loadingSlots}
              selectedDate={selectedDate}
              onDateChange={(date) => {
                setSelectedDate(date);
                setSlotLabel("");
              }}
              selectedSlotLabel={slotLabel}
              onSlotChange={(label) => {
                setSlotLabel(label);
                // Отказ относился к прежнему времени — новое его не наследует.
                setSubmitError(null);
                setSubmitErrorCode(null);
                goNext("when");
              }}
              error={slotsError}
              onRetry={() => setAvailabilityNonce((n) => n + 1)}
              salonTimeZone={salonTz}
              viewerTimeZone={viewerTimeZone}
              selectedMasterName={selectedMasterName ?? ""}
              isAnyMaster={masterId === ANY_MASTER_ID}
              horizonDays={horizonDays}
              onBack={() => goBack("when")}
            />
          ) : null}

          {step === "you" ? (
            <YouStep
              me={me}
              meLoading={meLoading}
              guestName={guestName}
              guestPhone={guestPhone}
              onGuestNameChange={setGuestName}
              onGuestPhoneChange={setGuestPhone}
              consent={consent}
              onConsentChange={setConsent}
              comment={comment}
              onCommentChange={setComment}
              silentMode={silentMode}
              onSilentChange={setSilentMode}
              loginHref={loginHref}
              onBack={() => goBack("you")}
            />
          ) : null}
        </StepTransition>

        {step === "you" && bookingConfig
          ? renderBookingConfig({
              bookingConfig,
              bookingConfigLoading,
              bookingConfigError,
              referencePreviewUrl,
              referenceUploading,
              referenceUploadError,
              onReferenceUpload: handleReferenceUpload,
              answers: bookingAnswers,
              setAnswers: setBookingAnswers,
            })
          : null}

        {step === "you" ? <div className="mt-4 space-y-3">{renderError()}</div> : null}
      </>
    );
  }
}

type SuccessState = {
  serviceName: string;
  masterName: string;
  dateLabel: string;
  timeLabel: string;
  manageUrl: string | null;
};

function SuccessBody({ success }: { success: SuccessState }) {
  return (
    <div>
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-success/15 text-success-text">
        ✓
      </div>
      <h2 className="mt-4 font-display text-2xl font-semibold text-text">{UI_TEXT.bookingWidget.success.title}</h2>
      <p className="mt-2 text-sm text-text-muted">
        {UI_TEXT.bookingWidget.success.detailsTemplate
          .replace("{service}", success.serviceName)
          .replace("{master}", success.masterName || UI_TEXT.bookingWidget.summary.anyMaster)
          .replace("{when}", `${success.dateLabel} · ${success.timeLabel}`)}
      </p>
      <p className="mt-2 text-xs text-text-muted">{UI_TEXT.bookingWidget.success.hint}</p>
      {success.manageUrl ? (
        <div className="mt-4">
          <GuestManageLinkCard manageUrl={success.manageUrl} />
        </div>
      ) : null}
    </div>
  );
}

function DialogSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-14 animate-pulse rounded-xl bg-muted/40" />
      <div className="h-72 animate-pulse rounded-2xl bg-muted/40" />
    </div>
  );
}

function BookingFlowSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="aspect-[16/9] animate-pulse rounded-2xl bg-muted/40 sm:aspect-auto sm:h-80" />
        <div className="h-14 animate-pulse rounded-xl bg-muted/40" />
        <div className="h-72 animate-pulse rounded-2xl bg-muted/40" />
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-muted/40" />
    </div>
  );
}

function renderBookingConfig(input: {
  bookingConfig: ServiceBookingConfig;
  bookingConfigLoading: boolean;
  bookingConfigError: string | null;
  referencePreviewUrl: string | null;
  referenceUploading: boolean;
  referenceUploadError: string | null;
  onReferenceUpload: (file: File) => void;
  answers: Record<string, string>;
  setAnswers: (updater: (current: Record<string, string>) => Record<string, string>) => void;
}) {
  const {
    bookingConfig,
    bookingConfigLoading,
    bookingConfigError,
    referencePreviewUrl,
    referenceUploading,
    referenceUploadError,
    onReferenceUpload,
    answers,
    setAnswers,
  } = input;

  if (bookingConfigLoading) {
    return <div className="mt-4 text-xs text-text-muted">{UI_TEXT.publicProfile.booking.bookingConfigLoading}</div>;
  }
  if (bookingConfigError) {
    return <div className="mt-4 text-xs text-danger-text">{bookingConfigError}</div>;
  }
  if (!bookingConfig.requiresReferencePhoto && bookingConfig.questions.length === 0) return null;

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-border-subtle bg-muted/30 p-4">
      <div className="text-sm font-semibold text-text">{UI_TEXT.publicProfile.booking.bookingConfigTitle}</div>
      {bookingConfig.requiresReferencePhoto ? (
        <div>
          {/* `renderBookingConfig` — обычная функция, а не компонент (у неё
              есть ранние return'ы), поэтому `useId` здесь звать нельзя:
              подпись связана с контролом обёрткой, а не `htmlFor`/`id`. */}
          <label className="block text-xs text-text-muted">
            {UI_TEXT.publicProfile.booking.referencePhotoLabel} <span className="text-danger-text">*</span>
            <FileInput
              mode="label-target"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file) onReferenceUpload(file);
              }}
              disabled={referenceUploading}
              className="peer"
            />
            <Button
              asChild
              variant="secondary"
              size="sm"
              className="mt-2 flex w-fit cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-primary-glow/45 peer-disabled:pointer-events-none peer-disabled:opacity-50"
            >
              <span>{UI_TEXT.publicProfile.booking.referencePhotoPick}</span>
            </Button>
          </label>
          {referenceUploading ? (
            <div className="mt-2 text-xs text-text-muted">{UI_TEXT.publicProfile.booking.referencePhotoUploading}</div>
          ) : null}
          {referenceUploadError ? <div className="mt-2 text-xs text-danger-text">{referenceUploadError}</div> : null}
          {referencePreviewUrl ? (
            <div className="relative mt-3 h-44 w-full overflow-hidden rounded-xl">
              <Image
                src={referencePreviewUrl}
                alt={UI_TEXT.publicProfile.booking.referencePhotoAlt}
                fill
                sizes="(max-width: 768px) 100vw, 480px"
                className="object-cover"
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {bookingConfig.questions.length > 0 ? (
        <div className="space-y-3">
          {bookingConfig.questions.map((question) => (
            <label key={question.id} className="block text-xs text-text-muted">
              <FieldLabel className="text-sm font-normal text-text">
                {question.text}
                {question.required ? <span className="text-danger-text"> *</span> : null}
              </FieldLabel>
              <Input
                type="text"
                value={answers[question.id] ?? ""}
                onChange={(event) =>
                  setAnswers((current) => ({ ...current, [question.id]: event.target.value }))
                }
                placeholder={UI_TEXT.publicProfile.booking.bookingAnswerPlaceholder}
              />
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
