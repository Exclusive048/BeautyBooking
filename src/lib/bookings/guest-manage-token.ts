import crypto from "crypto";
import { env } from "@/lib/env";

/**
 * GUEST-MANAGE-LINK (2026-09-24, решение владельца) — ссылка «Управлять
 * записью» для гостя: отменить или перенести запись без аккаунта.
 *
 * Подписанный HMAC токен (тот же приём, что `studio/master-view-token.ts`,
 * `media/chat-attachment-token.ts`): `{ bid, exp, purpose }`, подпись от
 * `AUTH_JWT_SECRET`, свой `purpose` — токен другой поверхности сюда не
 * подставить. Схема не меняется: право зашито в подпись.
 *
 * Токен — предъявительский: кто держит ссылку, тот управляет записью. Поэтому
 * его выдают только в ответе на создание гостевой записи (тому, кто её создал)
 * и только пока клиент записи — гостевой профиль (`guest-manage.ts`). В пути
 * страницы, а не в query: query-строка оседает в логах и реферере.
 *
 * `bid` — id записи: booking-флоу входит в исключения rule 12 (id нужен
 * клиенту для последующих запросов), а подпись не даёт подставить чужой.
 */
const TOKEN_PURPOSE = "guest-booking-manage";
/** 120 дней: запись дальше горизонта записи не бывает, после визита ссылка не нужна. */
const TTL_SECONDS = 60 * 60 * 24 * 120;

type TokenPayload = {
  bid: string;
  exp: number;
  purpose: typeof TOKEN_PURPOSE;
};

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64url(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

function hmac(data: string): string {
  return base64url(crypto.createHmac("sha256", env.AUTH_JWT_SECRET).update(data).digest());
}

export function signGuestManageToken(bookingId: string, nowSeconds?: number): string {
  const issuedAt = nowSeconds ?? Math.floor(Date.now() / 1000);
  const payload: TokenPayload = { bid: bookingId, exp: issuedAt + TTL_SECONDS, purpose: TOKEN_PURPOSE };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${hmac(body)}`;
}

/** id записи из токена либо `null` (подделан, чужого назначения, истёк). */
export function verifyGuestManageToken(token: string, nowSeconds?: number): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  const expected = Buffer.from(hmac(body));
  const actual = Buffer.from(sig);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(fromBase64url(body).toString("utf8")) as TokenPayload;
  } catch {
    return null;
  }
  if (payload.purpose !== TOKEN_PURPOSE || typeof payload.bid !== "string" || !payload.bid) return null;
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) return null;
  return payload.bid;
}

/** Путь страницы управления (относительный — абсолютный собирает клиент). */
export function guestManagePath(token: string): string {
  return `/booking/manage/${token}`;
}
