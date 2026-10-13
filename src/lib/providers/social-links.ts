// FEAT-PROVIDER-SOCIALS — VK / Instagram / Telegram / MAX community links for
// providers (studios + masters). Free-text community/page links, NOT OAuth
// account auth and NOT the Telegram integration (FZ-199 killswitch gates login
// and delivery; a link to the master's own channel sends nothing anywhere).
//
// 🔴 SECURITY: a provider-entered value becomes a PUBLIC clickable href, so it
// is an XSS/phishing vector. This module is the single normalization boundary:
// it extracts a validated handle and RECONSTRUCTS the URL from a hardcoded
// `https://<allowed-host>/` base. Consequences by construction:
//   - the stored/rendered href can only ever point at vk.ru / instagram.com /
//     t.me / max.ru;
//   - a non-http(s) scheme (`javascript:`, `data:`, …) can never survive;
//   - a foreign host (`evil.com/…`) is rejected outright.
// The SAME pure function runs on the server (persist-time validation — the
// authoritative boundary) AND on the client (live cabinet preview) AND at
// public render (defense-in-depth re-validation), so all three agree.
//
// Client-safe: pure, zero server-only deps (rule 13) — importable anywhere.

export type SocialKind = "vk" | "instagram" | "telegram" | "max";

/** Все виды — в порядке показа (кабинеты, публичные иконки). */
export const SOCIAL_KINDS: readonly SocialKind[] = ["vk", "instagram", "telegram", "max"];

/** Колонка `Provider` (и поле API) для вида ссылки. */
export const SOCIAL_FIELD = {
  vk: "socialVk",
  instagram: "socialInstagram",
  telegram: "socialTelegram",
  max: "socialMax",
} as const satisfies Record<SocialKind, string>;

export type SocialField = (typeof SOCIAL_FIELD)[SocialKind];

/** Значения ссылок провайдера по видам — то, что читают публичные иконки. */
export type SocialLinkValues = Partial<Record<SocialKind, string | null | undefined>>;

export type SocialNormalizeResult =
  | { status: "empty" }
  | { status: "ok"; url: string; handle: string }
  | { status: "invalid" };

// Handle charset: letters, digits, `_`, `.`, `-`. Deliberately excludes `:`,
// `/`, whitespace and every URL-structural / scheme character, so a token that
// passes can never carry a scheme or host. vk custom names + id/club/public
// prefixes and instagram usernames (which allow `.`/`_`) all fit within this.
const HANDLE_RE = /^[A-Za-z0-9_.-]{1,64}$/;

// Only a scheme immediately followed by `://` counts as an explicit scheme —
// this is what lets us reject `javascript://…` while treating a bare
// `javascript:alert(1)` (no `//`) as a plain token (which then fails HANDLE_RE).
const EXPLICIT_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

// SOCIAL-TG-MAX: Telegram username — латиница, цифры, `_`; 5–32 знака, у
// аукционных (Fragment) бывает 4. Точки и дефиса в нём нет.
const TELEGRAM_USERNAME_RE = /^[A-Za-z0-9_]{4,32}$/;

// Код приглашения в закрытый канал (Telegram `+…`, MAX `join/…`) и код ссылки
// на профиль MAX (`u/…`) — base64url, без структурных знаков URL.
const INVITE_CODE_RE = /^[A-Za-z0-9_-]{8,128}$/;

// Служебные адреса t.me — не каналы: `t.me/share`, `t.me/proxy`… Сохранить их
// значило бы показать в профиле ссылку, которая открывает не канал мастера.
const TELEGRAM_RESERVED = new Set([
  "share",
  "addstickers",
  "addemoji",
  "addtheme",
  "addlist",
  "proxy",
  "socks",
  "login",
  "setlanguage",
  "confirmphone",
  "invoice",
  "contact",
  "boost",
  "giftcode",
  "joinchat",
]);

// Первые сегменты max.ru, за которыми идёт код, а не сам адрес канала.
const MAX_RESERVED = new Set(["join", "u"]);

/**
 * Путь ссылки → канонический хвост адреса (без ведущего `/`) либо `null`.
 * Хвост собирается только из прошедших проверку сегментов, поэтому схемы и
 * хоста в нём быть не может — их подставляет `base`.
 */
type PathRule = (segments: readonly string[]) => string | null;

type SocialConfig = {
  base: string;
  hosts: readonly string[];
  label: string;
  fromPath: PathRule;
  /** Голое значение после `@` («durov», «+AbCd…»). */
  fromToken: (token: string) => string | null;
};

const firstSegmentHandle: PathRule = ([first]) => (first && HANDLE_RE.test(first) ? first : null);
const bareHandle = (token: string) => (HANDLE_RE.test(token) ? token : null);

function telegramUsername(value: string | undefined): string | null {
  if (!value || !TELEGRAM_USERNAME_RE.test(value)) return null;
  return TELEGRAM_RESERVED.has(value.toLowerCase()) ? null : value;
}

function telegramInvite(code: string | undefined): string | null {
  return code && INVITE_CODE_RE.test(code) ? `+${code}` : null;
}

// FIX-VK-RU-DOMAIN: канонический домен ВКонтакте в РФ — `vk.ru`. Он же —
// единственная база, из которой реконструируется href (`base`).
//
// 🔴 `vk.com` остаётся в `hosts`, но ТОЛЬКО как ПРИНИМАЕМЫЙ ввод, не как выход:
// пользователи копируют ссылки в обеих формах, а в БД уже лежат строки с
// `https://vk.com/...` (нормализатор идемпотентен — при следующем сохранении
// такая строка канонизируется в `vk.ru`). Убрать `vk.com` из `hosts` значило бы
// отвергать легитимный ввод и ронять `safeSocialHref` на существующих строках,
// то есть тихо гасить уже сохранённую ссылку на публичном профиле.
//
// SOCIAL-TG-MAX: у Telegram и MAX адрес — не только ник. Telegram: открытый
// канал `t.me/<ник>` (веб-превью `t.me/s/<ник>` и ссылка на пост
// `t.me/<ник>/123` сводятся к нему же), закрытый — `t.me/+<код>` (старая форма
// `t.me/joinchat/<код>` сводится к ней). MAX: открытый канал `max.ru/<ник>`,
// приглашение в закрытый — `max.ru/join/<код>`, ссылка на профиль —
// `max.ru/u/<код>` (ника у профиля MAX нет). `web.max.ru` в `hosts` нет:
// адреса веб-версии содержат внутренний номер чата, по ним канал не откроется.
const SOCIAL_CONFIG: Record<SocialKind, SocialConfig> = {
  vk: {
    base: "https://vk.ru/",
    hosts: ["vk.ru", "www.vk.ru", "m.vk.ru", "vk.com", "www.vk.com", "m.vk.com"],
    label: "vk.ru",
    fromPath: firstSegmentHandle,
    fromToken: bareHandle,
  },
  instagram: {
    base: "https://instagram.com/",
    hosts: ["instagram.com", "www.instagram.com", "m.instagram.com"],
    label: "instagram.com",
    fromPath: firstSegmentHandle,
    fromToken: bareHandle,
  },
  telegram: {
    base: "https://t.me/",
    hosts: ["t.me", "www.t.me", "telegram.me", "www.telegram.me"],
    label: "t.me",
    fromPath: ([first, second]) => {
      if (!first) return null;
      if (first.startsWith("+")) return telegramInvite(first.slice(1));
      const lower = first.toLowerCase();
      if (lower === "joinchat") return telegramInvite(second);
      if (lower === "s") return telegramUsername(second);
      return telegramUsername(first);
    },
    fromToken: (token) =>
      token.startsWith("+") ? telegramInvite(token.slice(1)) : telegramUsername(token),
  },
  max: {
    base: "https://max.ru/",
    hosts: ["max.ru", "www.max.ru"],
    label: "max.ru",
    fromPath: ([first, second]) => {
      if (!first) return null;
      const lower = first.toLowerCase();
      if (MAX_RESERVED.has(lower)) {
        return second && INVITE_CODE_RE.test(second) ? `${lower}/${second}` : null;
      }
      return HANDLE_RE.test(first) ? first : null;
    },
    fromToken: (token) =>
      HANDLE_RE.test(token) && !MAX_RESERVED.has(token.toLowerCase()) ? token : null,
  },
};

/** Канонический хост вида для сообщений об ошибке («Укажите адрес на vk.ru»). */
export function socialHostLabel(kind: SocialKind): string {
  return SOCIAL_CONFIG[kind].label;
}

function stripLeadingAt(value: string): string {
  return value.startsWith("@") ? value.slice(1) : value;
}

/**
 * Normalize a free-text social input (a full URL — with or without scheme /
 * `www.` / `m.` — OR a bare `@handle` / `handle`) into a canonical,
 * guaranteed-safe `https://<host>/<path>` URL plus the canonical path.
 *
 * - `{ status: "empty" }`   → blank input; the caller clears the field (null).
 * - `{ status: "ok", url, handle }` → safe canonical link (host + scheme locked);
 *                             `handle` — canonical path after the host
 *                             (`durov`, `+AbCd…`, `join/AbCd…`).
 * - `{ status: "invalid" }` → hostile / foreign-host / malformed; the caller
 *                             rejects it (never stores a live href).
 */
export function normalizeSocialLink(
  kind: SocialKind,
  raw: string | null | undefined,
): SocialNormalizeResult {
  const cfg = SOCIAL_CONFIG[kind];
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { status: "empty" };

  const withoutAt = stripLeadingAt(trimmed).trim();
  if (!withoutAt) return { status: "empty" };

  let handle: string | null;

  // Anything with a path separator or an explicit scheme is parsed as a URL and
  // its host is validated against the allowlist. A bare token skips URL parsing.
  const looksLikeUrl = withoutAt.includes("://") || withoutAt.includes("/");
  if (looksLikeUrl) {
    const candidate = EXPLICIT_SCHEME_RE.test(withoutAt) ? withoutAt : `https://${withoutAt}`;
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      return { status: "invalid" };
    }
    // Scheme allowlist — blocks javascript: / data: / anything non-web.
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { status: "invalid" };
    }
    // Host allowlist — blocks foreign hosts (evil.com/…).
    if (!cfg.hosts.includes(parsed.hostname.toLowerCase())) {
      return { status: "invalid" };
    }
    handle = cfg.fromPath(parsed.pathname.split("/").filter(Boolean));
  } else {
    // Bare token. A lone allowed-host domain ("vk.ru") carries no handle.
    if (cfg.hosts.includes(withoutAt.toLowerCase())) {
      return { status: "invalid" };
    }
    handle = cfg.fromToken(withoutAt);
  }

  if (!handle) {
    return { status: "invalid" };
  }

  // Reconstruct from the hardcoded safe base — the host + scheme are ours, only
  // the validated path is user-derived.
  return { status: "ok", url: `${cfg.base}${handle}`, handle };
}

/**
 * Server persist helper: raw input → the value to store (`string` normalized
 * URL, or `null` to clear). Throws-free — returns `{ invalid: true }` so the
 * caller can map it to a clean 400. Idempotent on an already-normalized URL.
 */
export function resolveStoredSocialLink(
  kind: SocialKind,
  raw: string | null | undefined,
): { value: string | null } | { invalid: true } {
  const result = normalizeSocialLink(kind, raw);
  if (result.status === "empty") return { value: null };
  if (result.status === "ok") return { value: result.url };
  return { invalid: true };
}

/**
 * Render helper (defense-in-depth): return a safe href for a stored value, or
 * `null` if it is empty / (somehow) unsafe. Public components call this so a
 * manually-corrupted DB row can never emit a dangerous link.
 */
export function safeSocialHref(kind: SocialKind, stored: string | null | undefined): string | null {
  const result = normalizeSocialLink(kind, stored);
  return result.status === "ok" ? result.url : null;
}

/** Short display handle for the cabinet preview (e.g. `vk.ru/durov`). */
export function socialDisplayLabel(kind: SocialKind, stored: string | null | undefined): string | null {
  const result = normalizeSocialLink(kind, stored);
  if (result.status !== "ok") return null;
  return result.url.replace(/^https:\/\//, "");
}
