import { headers } from "next/headers";
import { env, isProduction } from "@/lib/env";
import type { ApiResponse } from "@/lib/types/api";

/**
 * PWA-FIX-02 — SSR-запрос к собственному API идёт ПО ПЕТЛЕ, а не по публичному
 * домену.
 *
 * 🔴 Что было сломано на боевом стенде (замер 2026-09-01, masterryadom.ru/u/makeupartem).
 * База URL строилась из заголовков запроса (`x-forwarded-host` → `masterryadom.ru`),
 * то есть контейнер `web` при рендере страницы делал ВНЕШНИЙ HTTPS-запрос на
 * собственное публичное имя: наружу через traefik и обратно. Такой путь требует
 * hairpin-NAT и работает не везде — на этом стенде `fetch` бросал, и все три
 * секции публичного профиля, устроенные через этот хелпер, отдавали «Не удалось
 * загрузить блок»: портфолио, отзывы и — что дороже всего — **блок записи**
 * (`booking-section` резолвит провайдера через `/api/providers/{id}`).
 *
 * Корреляция была стопроцентной и она же служит доказательством: падали ровно
 * те секции, что ходят сюда, а `hero`/`services`, читающие БД напрямую
 * (`getMasterPublicProfileView`), рендерились нормально. Сам эндпоинт при этом
 * снаружи отвечал 200 — то есть дефект был в ПУТИ, а не в данных.
 *
 * ⚠️ Отказ приходил именно исключением, а не HTTP-статусом: ветка `!res.ok`
 * ниже возвращает `{ok:false}`, и вызывающие показывают на ней пустой список,
 * тогда как «Не удалось загрузить блок» ставится в `catch`. Значит виноват был
 * транспорт (DNS/соединение/TLS), и петля лечит все три случая разом.
 *
 * Почему петля, а не имя сервиса `api` из compose: `web` и `api` — один и тот
 * же образ с полным набором роутов, traefik лишь делит внешний трафик. Значит
 * контейнер отвечает на `/api/*` сам, и обращение к 127.0.0.1 не зависит ни от
 * DNS, ни от топологии, ни от того, поднят ли сосед.
 *
 * 🔴 Клиентский IP при этом обязан ехать дальше. Петлевой запрос приходит
 * с `127.0.0.1`, и без проброса `x-forwarded-for` ВСЕ SSR-обращения схлопнулись
 * бы в один ключ per-IP лимитера — то есть популярная страница выедала бы лимит
 * сама себе (`/api/feed/portfolio` — тир 120/60с). Заголовок копируется как
 * есть, поэтому `extractClientIp` (peel справа по `TRUSTED_PROXY_HOPS`) видит
 * ту же цепочку, что и на исходном запросе.
 *
 * В dev база по-прежнему берётся из заголовков: там нет разделения web/api, а
 * порт может быть занят (Next молча уходит на следующий), и петля на 3000
 * попала бы в чужое приложение.
 */
async function buildAbsoluteUrl(path: string): Promise<string> {
  if (isProduction) return `http://127.0.0.1:${env.PORT}${path}`;
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  if (!host) return path;
  return `${proto}://${host}${path}`;
}

export async function serverApiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<ApiResponse<T>> {
  const hdrs = await headers();
  const cookie = hdrs.get("cookie");
  const url = await buildAbsoluteUrl(path);

  const requestHeaders = new Headers(init?.headers);
  if (cookie) requestHeaders.set("cookie", cookie);

  // См. шапку: без этого per-IP лимиты считались бы по адресу петли.
  const forwardedFor = hdrs.get("x-forwarded-for");
  if (forwardedFor && !requestHeaders.has("x-forwarded-for")) {
    requestHeaders.set("x-forwarded-for", forwardedFor);
  }

  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: requestHeaders,
  });

  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;

  if (!res.ok) {
    return { ok: false, error: { message: `Ошибка запроса к сервису: ${res.status}.` } };
  }

  if (!json) {
    return { ok: false, error: { message: "Не удалось получить ответ. Попробуйте ещё раз." } };
  }

  return json;
}
