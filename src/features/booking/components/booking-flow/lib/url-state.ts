/**
 * URL state for booking widget (32b).
 *
 * `?bookingId=` survives across refresh — when present, the widget skips
 * selection/form and hydrates the success card via `bookingReadPath`
 * (guest token or booking-side session; PUBLIC-BOOKING-READ-TOKEN).
 *
 * Mutations use `history.replaceState` (not push) so the back button
 * doesn't trap the user inside the widget.
 */
const BOOKING_ID_PARAM = "bookingId";

export function readBookingIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const value = params.get(BOOKING_ID_PARAM);
  return value && value.length >= 8 ? value : null;
}

export function writeBookingIdToUrl(bookingId: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set(BOOKING_ID_PARAM, bookingId);
  window.history.replaceState({}, "", url.toString());
}

export function clearBookingIdFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(BOOKING_ID_PARAM)) return;
  const bookingId = url.searchParams.get(BOOKING_ID_PARAM);
  if (bookingId) forgetManageUrl(bookingId);
  url.searchParams.delete(BOOKING_ID_PARAM);
  window.history.replaceState({}, "", url.toString());
}

/**
 * PUBLIC-BOOKING-READ-TOKEN (SEC-11b): id записи в адресе больше не открывает
 * её карточку сам по себе. Вошедшая сторона брони читает по сессии, а гость —
 * по токену ссылки «Управлять записью», которую сервер отдаёт ТОЛЬКО в ответе
 * на создание. Чтобы обновление страницы гостю не стирало экран успеха,
 * ссылка хранится в `sessionStorage` вкладки рядом с id: не в адресе (id там
 * виден всем, кому показали экран или ссылку), не в `localStorage` (вкладка
 * закрыта — ссылка забыта; копию гость уносит кнопкой «Скопировать»).
 * Хранилище может быть недоступно (приватный режим) — тогда просто нечего
 * восстановить, и карточка после обновления не открывается, как без ссылки.
 */
const MANAGE_URL_KEY_PREFIX = "mr:booking-manage:";
const MANAGE_PATH_PREFIX = "/booking/manage/";

export function rememberManageUrl(bookingId: string, manageUrl: string): void {
  try {
    window.sessionStorage.setItem(MANAGE_URL_KEY_PREFIX + bookingId, manageUrl);
  } catch {
    /* хранилище недоступно — восстановления не будет */
  }
}

export function readRememberedManageUrl(bookingId: string): string | null {
  try {
    const value = window.sessionStorage.getItem(MANAGE_URL_KEY_PREFIX + bookingId);
    return value && manageTokenFromUrl(value) ? value : null;
  } catch {
    return null;
  }
}

function forgetManageUrl(bookingId: string): void {
  try {
    window.sessionStorage.removeItem(MANAGE_URL_KEY_PREFIX + bookingId);
  } catch {
    /* нечего забывать */
  }
}

/** Токен из ссылки «Управлять записью» (`/booking/manage/<токен>`), иначе `null`. */
export function manageTokenFromUrl(manageUrl: string): string | null {
  const path = manageUrl.split(/[?#]/, 1)[0] ?? "";
  if (!path.startsWith(MANAGE_PATH_PREFIX)) return null;
  const token = path.slice(MANAGE_PATH_PREFIX.length);
  return token.length > 0 && !token.includes("/") ? token : null;
}

/**
 * Откуда читать карточку записи: по токену гостя, если ссылка есть, иначе —
 * по id (ответит только сессии стороны брони, остальным — 404).
 */
export function bookingReadPath(bookingId: string, manageUrl: string | null | undefined): string {
  const token = manageUrl ? manageTokenFromUrl(manageUrl) : null;
  return token
    ? `/api/public/bookings/manage/${encodeURIComponent(token)}`
    : `/api/public/bookings/${encodeURIComponent(bookingId)}`;
}

/**
 * BOOKING-WIDGET-DIALOG: закрытое окно записи убирает из адреса параметры, с
 * которыми его открыли (`?serviceId=`, `?slotStartAt=`…), — иначе обновление
 * страницы открыло бы его снова.
 */
export function clearSearchParamsFromUrl(names: readonly string[]): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const name of names) {
    if (!url.searchParams.has(name)) continue;
    url.searchParams.delete(name);
    changed = true;
  }
  if (changed) window.history.replaceState({}, "", url.toString());
}
