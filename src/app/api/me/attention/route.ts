import { getSessionUserId } from "@/lib/auth/session";
import { toAppError } from "@/lib/api/errors";
import { fail, ok } from "@/lib/api/response";
import { getClientSidebarCounts } from "@/lib/client-cabinet/sidebar-counts";
import { getRequestId, logError } from "@/lib/logging/logger";

/**
 * NAV-ATTENTION-01 — «что ждёт действия» для общей нижней навигации сайта.
 *
 * Кабинеты получают те же числа с сервера вместе с шеллом (`getClientSidebarCounts`
 * в `(user)/layout.tsx`), а общая навигация публичных страниц — клиентский
 * компонент без серверных данных, поэтому ей нужен свой лёгкий вход. Считает
 * та же функция, что кабинет, — две поверхности не могут разойтись в числе.
 * Гость получает нули, а не 401: навигация одна на гостя и вошедшего, и отказ
 * здесь означал бы лишний шум в консоли каждой публичной страницы.
 *
 * ERROR-ENVELOPE-NEW-ROUTES: сбой БД — конверт `{ ok:false, error }` и строка
 * `logError` с маршрутом, а не HTML-страница 500 Next.
 */
export async function GET(req: Request) {
  try {
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
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/me/attention failed", {
        requestId: getRequestId(req),
        route: "GET /api/me/attention",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code);
  }
}
