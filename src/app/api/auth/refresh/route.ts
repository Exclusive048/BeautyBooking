import { cookies } from "next/headers";
import { fail, ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { clearSessionCookies, getRefreshCookieName, rotateSessionCookies } from "@/lib/auth/session";
import { recordSurfaceEvent } from "@/lib/monitoring/status";

const REFRESH_COOKIE_NAME = getRefreshCookieName();

/**
 * SEC-24 — GET-обработчик удалён; ротация сессии осталась только на POST.
 *
 * GET ротировал сессию и редиректил на `?next=`, то есть менял состояние по
 * навигации — а межсайтовая top-level навигация отправляет `SameSite=Lax`-куки,
 * и этот путь вдобавок исключён из рейт-лимита (`proxy.ts:140`, намеренно: там
 * же прокси сам зовёт refresh изнутри). Токены атакующему не доставались и
 * `next` санировался, так что потолок был «принудительная ротация чужой
 * сессии», — но ротация по GET ровно та форма, которую CSRF-слой (SEC-08) не
 * ловит: он гейтит только мутирующие МЕТОДЫ.
 *
 * Удаление, а не гейт, потому что обработчик был не нужен: вызывающих ноль
 * (`src/`, `.qa/`, `scripts/`), а прозрачное обновление сессии при навигации
 * делает сам прокси — он вызывает **POST** этого же роута, когда access-токен
 * протух (`proxy.ts:299-319`). То есть возможность, которую GET предоставлял,
 * продукт уже получает другим путём.
 */
export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(REFRESH_COOKIE_NAME)?.value;
    if (!refreshToken) {
      void recordSurfaceEvent({
        surface: "auth",
        outcome: "failure",
        operation: "refresh-post",
        code: "NO_REFRESH_TOKEN",
      });
      return fail("Сессия не найдена. Войдите заново.", 401, "UNAUTHORIZED");
    }

    const response = ok({ ok: true });
    const session = await rotateSessionCookies(response, refreshToken);
    if (!session) {
      void recordSurfaceEvent({
        surface: "auth",
        outcome: "failure",
        operation: "refresh-post",
        code: "INVALID_REFRESH_TOKEN",
      });
      const unauthorized = fail("Сессия истекла. Войдите заново.", 401, "UNAUTHORIZED");
      clearSessionCookies(unauthorized);
      unauthorized.headers.set("Cache-Control", "no-store");
      return unauthorized;
    }

    response.headers.set("Cache-Control", "no-store");
    return response;
  });
}
