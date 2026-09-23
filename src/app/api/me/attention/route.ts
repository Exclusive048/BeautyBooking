import { getSessionUserId } from "@/lib/auth/session";
import { ok } from "@/lib/api/response";
import { getClientSidebarCounts } from "@/lib/client-cabinet/sidebar-counts";

/**
 * NAV-ATTENTION-01 — «что ждёт действия» для общей нижней навигации сайта.
 *
 * Кабинеты получают те же числа с сервера вместе с шеллом (`getClientSidebarCounts`
 * в `(user)/layout.tsx`), а общая навигация публичных страниц — клиентский
 * компонент без серверных данных, поэтому ей нужен свой лёгкий вход. Считает
 * та же функция, что кабинет, — две поверхности не могут разойтись в числе.
 * Гость получает нули, а не 401: навигация одна на гостя и вошедшего, и отказ
 * здесь означал бы лишний шум в консоли каждой публичной страницы.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return ok({ bookings: 0, messages: 0, reviews: 0 });
  }
  const counts = await getClientSidebarCounts(userId);
  return ok({
    bookings: counts.bookingsAwaitingClient,
    messages: counts.unreadMessages,
    reviews: counts.pendingReviews,
  });
}
