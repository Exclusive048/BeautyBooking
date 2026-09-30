import { cache } from "react";
import { getSessionUser } from "@/lib/auth/session";

/**
 * 29.09 доработки · 13 — пользователь сессии для SSR публичных страниц мастера
 * и студии. Секции читают сервисы напрямую (не HTTP к собственному API), и
 * сессия нужна нескольким из них в одном рендере — `cache()` делает из этого
 * один запрос на рендер. Гость — `null`.
 */
export const getViewer = cache(getSessionUser);
