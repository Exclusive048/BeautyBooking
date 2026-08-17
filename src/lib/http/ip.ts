import { env } from "@/lib/env";

export type ClientIpOptions = {
  /** Trusted reverse-proxy hop count (defaults to `env.TRUSTED_PROXY_HOPS`). */
  trustedHops?: number;
  /** Dedicated real-IP header the edge SETS (defaults to `env.TRUSTED_REAL_IP_HEADER`). */
  realIpHeader?: string | null;
};

function firstNonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

/**
 * FIX-17 (HARDENING-08): derive the client IP behind a trusted reverse proxy
 * WITHOUT trusting client-supplied `X-Forwarded-For` entries.
 *
 * A reverse proxy that appends (nginx `proxy_add_x_forwarded_for`) puts the IP
 * IT saw at the RIGHT of XFF; anything a client prepends stays on the LEFT. So
 * the real client is the entry `TRUSTED_PROXY_HOPS` from the right (peeling the
 * trusted hops) — NEVER the leftmost, which is attacker-controlled (the old bug:
 * rotating the leftmost value defeated per-IP rate limits → OTP/SMS bombing).
 *
 * The prod topology (# of trusted proxies) is a DEPLOY fact — `TRUSTED_PROXY_HOPS`
 * (default 1: the single reverse proxy that fronts the app, per docker-compose
 * `127.0.0.1:3000`). Safe-default reasoning: a hop count LOWER than reality
 * yields a trusted-infra IP (coarse but NOT attacker-controlled); a count HIGHER
 * than reality re-opens spoofing — so the default errs LOW and the operator only
 * RAISES it to match a multi-hop edge (CDN+LB). If the edge overwrites a
 * dedicated header instead of appending XFF, set `TRUSTED_REAL_IP_HEADER`.
 *
 * For a legitimate single-hop request (one XFF entry) or dev (no XFF), this
 * returns the SAME value as the old leftmost logic — only spoofed leftmost
 * entries stop working.
 */
/**
 * Структурный минимум, который нужен резолверу: что-то с `headers.get()`.
 * `Request` ему удовлетворяет, поэтому все существующие вызовы не меняются;
 * Server Component может передать `{ headers: await headers() }` (RKN-FIX-10 —
 * там `Request` недоступен, а IP для следа чтений нужен).
 */
export type HeaderCarrier = { headers: Pick<Headers, "get"> };

/** Откуда в итоге взялся адрес — три ветки резолвера плюс «неоткуда». */
export type ClientIpSource =
  | "trusted-real-ip-header"
  | "x-forwarded-for"
  | "x-real-ip"
  | "none";

/**
 * FIX-B17 — полная картина одного разрешения клиентского IP.
 *
 * Зачем отдельный тип, если наружу нужен один адрес: `TRUSTED_PROXY_HOPS`
 * проверялся «наблюдением» — то есть тем, что кто-то замечал, что всё вроде
 * работает. Неверное значение не даёт ни ошибки, ни лога: каждый per-IP лимит
 * продукта тихо становится глобальным (хопов меньше реальности) либо тихо
 * обходимым (хопов больше). Диагностика превращает «проверить наблюдением» в
 * «спросить одним запросом» — её читает `GET /api/admin/diagnostics/client-ip`
 * и детектор `lib/http/proxy-trust.ts`.
 *
 * 🔴 Это ЕДИНСТВЕННЫЙ решатель: `extractClientIp` возвращает `resolvedIp`
 * отсюда, а не считает второй раз. Вторая копия арифметики означала бы, что
 * диагностика способна показать не то, чем пользуется лимитер, — то есть
 * инструмент проверки врал бы ровно в том случае, ради которого заведён.
 */
export type ClientIpDiagnostics = {
  /** Сырой `X-Forwarded-For` как пришёл (null — заголовка не было). */
  forwardedFor: string | null;
  /** Разобранная цепочка XFF слева направо: пустые записи отброшены. */
  chain: string[];
  /** Значение из конфигурации/опций ДО нормализации. */
  configuredHops: number;
  /** Сколько хопов реально снято (не-конечное/≤0 → 1). */
  effectiveHops: number;
  /** Имя выделенного заголовка, если оператор его объявил. */
  trustedRealIpHeader: string | null;
  /** Значение этого заголовка в текущем запросе. */
  trustedRealIpValue: string | null;
  /** `X-Real-IP` — последняя запасная ветка. */
  xRealIp: string | null;
  /** Итог: то же самое, что вернёт `extractClientIp`. */
  resolvedIp: string | null;
  source: ClientIpSource;
  /**
   * Цепочка КОРОЧЕ настроенных хопов, поэтому снятие упёрлось в левый край.
   * Это наблюдаемый признак «хопов больше реальной топологии»: у обычного
   * запроса (клиент не подставлял свой XFF) длина цепочки равна числу
   * реальных прокси, и настройка выше этого числа клампится КАЖДЫЙ раз.
   * ⚠️ Признак говорит о конфигурации, а не об эксплуатации: запрос
   * атакующего, который дописал достаточно записей слева, НЕ клампится —
   * его подставленная запись просто потребляется молча.
   */
  clamped: boolean;
  /** Итоговый адрес — приватный/loopback/link-local, то есть инфраструктура. */
  resolvedIsPrivate: boolean;
};

/**
 * Best-effort: приватный ли адрес. Нужен только как СИГНАЛ («мы разрешили
 * запрос в собственную инфраструктуру»), поэтому разбирается снисходительно —
 * форма `ip:port` и `[v6]:port` встречается у части прокси.
 */
function stripPortAndBrackets(value: string): string {
  const trimmed = value.trim();
  const bracketed = trimmed.match(/^\[([^\]]+)\](?::\d+)?$/u);
  if (bracketed) return bracketed[1]!;
  // IPv4 с портом — ровно один двоеточие; у голого IPv6 их больше.
  if ((trimmed.match(/:/gu) ?? []).length === 1 && trimmed.includes(".")) {
    return trimmed.split(":")[0]!;
  }
  return trimmed;
}

export function isPrivateClientAddress(value: string | null): boolean {
  if (!value) return false;
  const host = stripPortAndBrackets(value).toLowerCase();
  if (host.length === 0 || host === "unknown") return false;

  if (host === "::1" || host === "::" || host === "0.0.0.0") return true;
  // IPv4-mapped IPv6 (`::ffff:10.0.0.1`) — судим по хвосту.
  const mapped = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/u);
  const candidate = mapped ? mapped[1]! : host;

  const v4 = candidate.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }

  // ULA (fc00::/7) и link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{0,2}:/u.test(candidate)) return true;
  if (/^fe[89ab][0-9a-f]?:/u.test(candidate)) return true;
  return false;
}

export function resolveClientIpDiagnostics(
  req: HeaderCarrier,
  options?: ClientIpOptions,
): ClientIpDiagnostics {
  // 1. Dedicated trusted header — only if the operator confirms the edge SETS it
  //    (an overwrite-mode edge that passes client XFF through). Preferred when set.
  const realIpHeader = (options?.realIpHeader ?? env.TRUSTED_REAL_IP_HEADER)?.trim();
  const trustedRealIpHeader = realIpHeader && realIpHeader.length > 0 ? realIpHeader : null;
  const trustedRealIpValue = trustedRealIpHeader
    ? firstNonEmpty(req.headers.get(trustedRealIpHeader))
    : null;

  // 2. XFF: peel the trusted hops from the RIGHT. Always ≥1 trusted proxy in prod
  //    (the app binds 127.0.0.1), so the rightmost entry is proxy-appended, not
  //    client-supplied. A non-finite/≤0 configured value falls back to 1 (never
  //    NaN → never silently reading the spoofable leftmost).
  const configuredHops = options?.trustedHops ?? env.TRUSTED_PROXY_HOPS;
  const effectiveHops = Number.isFinite(configuredHops)
    ? Math.max(1, Math.floor(configuredHops))
    : 1;
  const forwardedFor = req.headers.get("x-forwarded-for");
  const chain = (forwardedFor ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  // 3. Last resort — X-Real-IP (weaker: spoofable unless the edge sets it, but a
  //    coarse key is better than none when no XFF is present).
  const xRealIp = firstNonEmpty(req.headers.get("x-real-ip"));

  let resolvedIp: string | null;
  let source: ClientIpSource;
  if (trustedRealIpValue) {
    resolvedIp = trustedRealIpValue;
    source = "trusted-real-ip-header";
  } else if (chain.length > 0) {
    resolvedIp = chain[Math.max(0, chain.length - effectiveHops)] ?? null;
    source = "x-forwarded-for";
  } else if (xRealIp) {
    resolvedIp = xRealIp;
    source = "x-real-ip";
  } else {
    resolvedIp = null;
    source = "none";
  }

  return {
    forwardedFor,
    chain,
    configuredHops,
    effectiveHops,
    trustedRealIpHeader,
    trustedRealIpValue,
    xRealIp,
    resolvedIp,
    source,
    clamped: source === "x-forwarded-for" && chain.length < effectiveHops,
    resolvedIsPrivate: isPrivateClientAddress(resolvedIp),
  };
}

export function extractClientIp(req: HeaderCarrier, options?: ClientIpOptions): string | null {
  return resolveClientIpDiagnostics(req, options).resolvedIp;
}

/** String variant with an `"unknown"` fallback — convenient for rate-limit keys. */
export function getClientIp(req: HeaderCarrier): string {
  return extractClientIp(req) ?? "unknown";
}
