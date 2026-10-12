"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";
import { clearSearchParamsFromUrl } from "@/features/booking/components/booking-flow/lib/url-state";
import { FloatingBookingButton } from "@/features/booking/components/floating-booking-button";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * BOOKING-WIDGET-DIALOG — окно записи поверх страницы студии.
 *
 * «Записаться» в шапке, у услуги, у мастера команды и плавающая кнопка
 * открывают один и тот же мастер записи по шагам (услуга → мастер → время →
 * контакты); из кнопки услуги или мастера — с уже сделанным выбором. Раньше
 * каждая кнопка уводила на отдельную страницу `/u/[студия]/booking`, а
 * плавающая «К услугам» вела на якорь, которого на странице нет.
 *
 * Ссылки-триггеры сохраняют `href` на страницу записи: без провайдера (и при
 * открытии в новой вкладке) они ведут туда, как раньше.
 */

export type StudioBookingRequest = {
  serviceId?: string;
  /** `Provider.id` профиля мастера в студии. */
  masterId?: string;
  /** Адрес страницы мастера (`?master=` из ссылки). */
  masterKey?: string;
};

type ContextValue = { openBooking: (request?: StudioBookingRequest) => void };

const StudioBookingDialogContext = createContext<ContextValue | null>(null);

// Мастер записи грузится чанком при первом открытии — страница студии его
// в первой загрузке не несёт.
const StudioBookingFlow = dynamic(
  () => import("./studio-booking-flow/booking-flow").then((mod) => mod.StudioBookingFlow),
  { ssr: false },
);

/** Параметры записи в адресе страницы студии; окно убирает их при закрытии. */
const BOOKING_URL_PARAMS = ["serviceId", "master", "masterId", "slotStartAt"] as const;

type DialogState = { nonce: number; request: StudioBookingRequest; open: boolean };

export function StudioBookingDialogProvider({ studioId, children }: { studioId: string; children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);

  const openBooking = useCallback((request: StudioBookingRequest = {}) => {
    // Новый `nonce` — новый мастер записи: прошлый выбор не переносится в
    // запись, открытую другой кнопкой.
    setState((prev) => ({ nonce: (prev?.nonce ?? 0) + 1, request, open: true }));
  }, []);

  const close = useCallback(() => {
    setState((prev) => (prev ? { ...prev, open: false } : prev));
    clearSearchParamsFromUrl(BOOKING_URL_PARAMS);
  }, []);

  const value = useMemo(() => ({ openBooking }), [openBooking]);

  return (
    <StudioBookingDialogContext.Provider value={value}>
      {children}
      {state ? (
        <StudioBookingFlow
          key={state.nonce}
          studioId={studioId}
          initialServiceId={state.request.serviceId}
          initialMasterId={state.request.masterId}
          initialMasterKey={state.request.masterId ? undefined : state.request.masterKey}
          dialog={{ open: state.open, onClose: close }}
        />
      ) : null}
    </StudioBookingDialogContext.Provider>
  );
}

export function useStudioBookingDialog(): ContextValue | null {
  return useContext(StudioBookingDialogContext);
}

type LinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  /** Запасной путь — страница записи с теми же параметрами. */
  href: string;
  request?: StudioBookingRequest;
};

/**
 * Ссылка «Записаться»: на странице студии открывает окно записи, иначе (и с
 * Ctrl/Cmd/Shift, средней кнопкой) — переходит по `href`.
 */
export function StudioBookingLink({ href, request, onClick, children, ...rest }: LinkProps) {
  const dialog = useStudioBookingDialog();
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || !dialog) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    dialog.openBooking(request);
  };
  return (
    <Link href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}

/**
 * Открывает окно, если страница студии пришла по ссылке записи (`?serviceId=`,
 * `?master=` — каталог, поиск по времени, старые ссылки «Записаться»).
 * Владельцу студии не рендерится: записаться к себе нельзя.
 */
export function StudioBookingAutoOpen({ request }: { request: StudioBookingRequest }) {
  const dialog = useStudioBookingDialog();
  const doneRef = useRef(false);
  const { serviceId, masterId, masterKey } = request;
  useEffect(() => {
    if (doneRef.current || !dialog) return;
    if (!serviceId && !masterId && !masterKey) return;
    doneRef.current = true;
    dialog.openBooking({ serviceId, masterId, masterKey });
  }, [dialog, masterId, masterKey, serviceId]);
  return null;
}

/**
 * Плавающая «Записаться» страницы студии + автооткрытие окна по ссылке записи.
 * Владельцу студии не рендерится (решает серверная секция).
 */
export function StudioFloatingBooking({ request }: { request: StudioBookingRequest }) {
  const dialog = useStudioBookingDialog();
  return (
    <>
      <StudioBookingAutoOpen request={request} />
      {dialog ? (
        <FloatingBookingButton
          label={UI_TEXT.publicStudio.book}
          onClick={() => dialog.openBooking()}
          showOnDesktop
        />
      ) : null}
    </>
  );
}
