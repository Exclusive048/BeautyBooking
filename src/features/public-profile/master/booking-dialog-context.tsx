"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { FloatingBookingButton } from "@/features/booking/components/floating-booking-button";
import { scrollBehavior } from "@/lib/ui/scroll";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * BOOKING-WIDGET-DIALOG — запись на странице мастера.
 *
 * «Записаться» у услуги, в карточке записи и плавающая кнопка открывают одно
 * окно записи по шагам (услуга → время → контакты); из кнопки услуги — с этой
 * услугой. Окно живёт в секции записи (у неё данные мастера), а кнопки — в
 * других секциях страницы, поэтому секция записи регистрируется здесь как
 * «хозяин» окна. Раньше услуга добавлялась в выбор, а время и контакты ждали
 * в колонке справа (на телефоне — в конце страницы), и плавающая «Записаться»
 * без выбранной услуги ничего не делала.
 */

export type OpenMasterBooking = (serviceId?: string) => void;

type ContextValue = {
  openBooking: OpenMasterBooking;
  registerHost: (open: OpenMasterBooking | null) => void;
};

const MasterBookingContext = createContext<ContextValue | null>(null);

function scrollToBookingSection() {
  const el = document.getElementById("booking");
  if (!el) return;
  const y = el.getBoundingClientRect().top + window.scrollY - 16;
  window.scrollTo({ top: y, behavior: scrollBehavior() });
}

export function MasterBookingProvider({ children }: { children: ReactNode }) {
  const hostRef = useRef<OpenMasterBooking | null>(null);

  const openBooking = useCallback<OpenMasterBooking>((serviceId) => {
    // Секция записи ещё грузится (или не загрузилась) — показать её место.
    if (!hostRef.current) {
      scrollToBookingSection();
      return;
    }
    hostRef.current(serviceId);
  }, []);

  const registerHost = useCallback((open: OpenMasterBooking | null) => {
    hostRef.current = open;
  }, []);

  const value = useMemo(() => ({ openBooking, registerHost }), [openBooking, registerHost]);
  return <MasterBookingContext.Provider value={value}>{children}</MasterBookingContext.Provider>;
}

export function useMasterBooking(): ContextValue | null {
  return useContext(MasterBookingContext);
}

/** Секция записи объявляет, чем открывать запись; `open` обязан быть стабильным. */
export function useRegisterMasterBookingHost(open: OpenMasterBooking | null) {
  const ctx = useMasterBooking();
  useEffect(() => {
    if (!ctx || !open) return;
    ctx.registerHost(open);
    return () => ctx.registerHost(null);
  }, [ctx, open]);
}

/** Плавающая «Записаться» на телефоне; на ПК запись — в правой колонке. */
export function MasterFloatingBooking() {
  const ctx = useMasterBooking();
  if (!ctx) return null;
  return <FloatingBookingButton label={UI_TEXT.publicProfile.page.bookNow} onClick={() => ctx.openBooking()} />;
}
