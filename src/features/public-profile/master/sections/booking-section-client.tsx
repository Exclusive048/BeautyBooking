"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import {
  useRegisterMasterBookingHost,
  type OpenMasterBooking,
} from "@/features/public-profile/master/booking-dialog-context";
import {
  clearSearchParamsFromUrl,
  readBookingIdFromUrl,
} from "@/features/booking/components/booking-flow/lib/url-state";
import * as UI_TEXT from "@/lib/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { studioBookingUrl } from "@/lib/public-urls";

const tB = UI_TEXT.publicProfile.booking;
const tP = UI_TEXT.publicProfile.page;

// Окно записи (сетки дат и времени, форма) грузится чанком при первом
// открытии — первая загрузка страницы мастера его не несёт.
const MasterBookingDialog = dynamic(
  () => import("@/features/public-profile/master/master-booking-dialog").then((mod) => mod.MasterBookingDialog),
  { ssr: false },
);

/** Параметры записи в адресе страницы мастера; окно убирает их при закрытии. */
const BOOKING_URL_PARAMS = ["serviceId", "slotStartAt", "bookingId"] as const;

type Props = {
  provider: ProviderProfileDto;
  initialServiceId: string | null;
  initialSlotStartAt: string | null;
  studioPublicUsername: string | null;
};

type DialogState = {
  nonce: number;
  serviceId: string | null;
  slotStartAt: string | null;
  open: boolean;
};

export function BookingSectionClient({
  provider,
  initialServiceId,
  initialSlotStartAt,
  studioPublicUsername,
}: Props) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const masterKey = provider.publicUsername?.trim() ?? "";
  const canBook = provider.services.length > 0;

  // Studio master → redirect to studio booking
  const studioBookingHref =
    provider.type === "MASTER" && provider.studioId
      ? studioBookingUrl(
          { id: provider.studioId, publicUsername: studioPublicUsername },
          // STUDIO-MASTER-PROFILES (этап 4): у разделённого мастера в студии
          // работает его профиль в студии — выбираем его по id; до разделения
          // мастер в студии — сам личный профиль (по адресу страницы).
          provider.studioMasterProfileId
            ? { masterId: provider.studioMasterProfileId }
            : {
                master: masterKey || undefined,
                masterId: masterKey ? undefined : provider.id,
              },
          "master-studio-booking"
        )
      : null;
  // STUDIO-MASTER-OWN-BOOKINGS-01: мастер студии со своими услугами продаёт их
  // здесь; на студийные ведёт отдельная ссылка под карточкой.
  const studioOnly = Boolean(studioBookingHref) && !provider.sellsOwnServices;

  const openBooking = useCallback<OpenMasterBooking>((serviceId) => {
    // Новый `nonce` — новое окно: выбор прошлой записи не переносится.
    setDialog((prev) => ({ nonce: (prev?.nonce ?? 0) + 1, serviceId: serviceId ?? null, slotStartAt: null, open: true }));
  }, []);
  const goToStudioBooking = useCallback<OpenMasterBooking>(() => {
    if (studioBookingHref) router.push(studioBookingHref);
  }, [router, studioBookingHref]);
  useRegisterMasterBookingHost(studioOnly ? goToStudioBooking : canBook ? openBooking : null);

  const close = useCallback(() => {
    setDialog((prev) => (prev ? { ...prev, open: false } : prev));
    clearSearchParamsFromUrl(BOOKING_URL_PARAMS);
  }, []);

  // Страница пришла по ссылке записи (`?serviceId=`, `?slotStartAt=` — поиск по
  // времени, каталог) или после записи (`?bookingId=` — экран успеха при
  // обновлении страницы) — окно открывается само.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current || studioOnly || !canBook) return;
    autoOpenedRef.current = true;
    const bookingId = readBookingIdFromUrl();
    if (!initialServiceId && !initialSlotStartAt && !bookingId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- `?bookingId=` читается только после монтирования; на сервере окна нет
    setDialog({
      nonce: 1,
      // Экрану успеха нужен степпер, а степперу — услуга.
      serviceId: initialServiceId ?? (bookingId ? provider.services[0]?.id ?? null : null),
      slotStartAt: initialSlotStartAt,
      open: true,
    });
  }, [canBook, initialServiceId, initialSlotStartAt, provider.services, studioOnly]);

  if (studioOnly && studioBookingHref) {
    return (
      <Card>
        <CardContent className="space-y-3 p-5 md:p-5">
          <div className="text-sm font-semibold text-text-main">{tP.studioBookingTitle}</div>
          <div className="text-sm text-text-sec">{tP.studioBookingDescription}</div>
          <Link
            href={studioBookingHref}
            className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-4 py-2 text-sm font-medium text-accent-foreground shadow-card transition hover:shadow-hover"
          >
            {tP.studioBookingCta}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="lux-card rounded-3xl p-5 text-text-main">
        <div className="text-lg font-semibold">{tB.title}</div>

        {canBook ? (
          <>
            <p className="mt-2 text-sm text-text-sec">{tB.ctaHint}</p>
            <Button size="lg" onClick={() => openBooking()} className="mt-4 w-full">
              {tP.bookNow}
            </Button>
          </>
        ) : (
          <div className="mt-4 rounded-2xl border border-border-subtle bg-bg-input/70 p-4">
            <div className="text-sm font-medium">{tB.emptyTitle}</div>
            <div className="mt-2 text-sm text-text-sec">{tB.emptyDesc}</div>
          </div>
        )}

        {studioBookingHref ? (
          <Link
            href={studioBookingHref}
            className="mt-4 block text-center text-sm font-medium text-accent-text underline decoration-border-subtle underline-offset-4 transition hover:decoration-accent-text"
          >
            {tP.studioBookingAlso}
          </Link>
        ) : null}
      </div>

      {dialog ? (
        <MasterBookingDialog
          key={dialog.nonce}
          provider={provider}
          open={dialog.open}
          onClose={close}
          initialServiceId={dialog.serviceId}
          initialSlotStartAt={dialog.slotStartAt}
        />
      ) : null}
    </>
  );
}
