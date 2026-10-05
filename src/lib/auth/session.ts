import crypto from "crypto";
import { cookies, headers } from "next/headers";
import type { NextResponse } from "next/server";
import type { Prisma, SessionClientType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env, isProduction } from "@/lib/env";
import {
  REFRESH_TOKEN_TTL_SECONDS,
  signAccessToken,
  signAccessTokenWithExpiry,
  signRefreshTokenWithExpiry,
  verifyToken,
  type SessionPayload,
} from "./jwt";
import { isBearerAuthorization, selectAccessToken } from "./bearer";
import {
  readWebSessionIssueMeta,
  SESSION_DEVICE_META_KEYS,
  type SessionDeviceMeta,
  type SessionIssueMeta,
} from "./session-client-meta";
import { recordSurfaceEvent } from "@/lib/monitoring/status";
import { unlinkPushDevicesOfFamilies } from "@/lib/notifications/native-push/devices";

const ACCESS_COOKIE_MAX_AGE_SECONDS = 2 * 60 * 60;
const REFRESH_COOKIE_MAX_AGE_SECONDS = REFRESH_TOKEN_TTL_SECONDS;
const REFRESH_COOKIE_NAME = "bh_refresh";
/**
 * SESSION-REFRESH-PATH-01 — кука обновления отправляется на ВЕСЬ сайт.
 *
 * Прежний путь `/api/auth/refresh` означал, что браузер присылает её ровно
 * одному роуту, поэтому прозрачное обновление сессии в `src/proxy.ts`
 * (LOGIC-22 / PERF-14: прокси читает `bh_refresh` и ротирует сессию до
 * обработчика) в настоящем браузере не срабатывало НИКОГДА — его тесты клали
 * куку на `/cabinet/*` руками. Следствие: через 2 часа (жизнь access-токена)
 * любой переход по кабинету уводил на `/login`, а любая форма на обычном
 * `fetch` получала 401 «Требуется вход в аккаунт» — так тестировщик и увидел
 * отказ при создании категории, хотя первую отправил минутой раньше.
 * Кука по-прежнему httpOnly + Secure + SameSite=Lax; второй слой CSRF — в прокси.
 */
const REFRESH_COOKIE_PATH = "/";
/**
 * Путь, по которому кука жила до SESSION-REFRESH-PATH-01. Браузер держит её
 * отдельно (имя то же, путь другой) и на `/api/auth/refresh` прислал бы ПЕРВОЙ
 * (более длинный путь идёт раньше) — поэтому каждая выдача новой куки и выход
 * явно гасят старую.
 */
const LEGACY_REFRESH_COOKIE_PATH = "/api/auth/refresh";

export function getAccessCookieName(): string {
  return env.AUTH_COOKIE_NAME;
}

export function getRefreshCookieName(): string {
  return REFRESH_COOKIE_NAME;
}

function isSecureCookie(): boolean {
  return isProduction;
}

type SessionCookiePayload = Omit<SessionPayload, "iat" | "exp" | "tokenType" | "jti" | "sid">;

/**
 * MOBILE-AUTH-A — пара токенов сессии без транспорта. Веб кладёт её в куки
 * (`setSessionCookies` / `rotateSessionCookies` — тонкие адаптеры), мобильный
 * клиент получает в теле ответа `/api/mobile/v1/auth/*`. Сроки — ровно те, что
 * в токенах (для refresh — не позже срока строки `RefreshSession`).
 */
export type SessionTokens = {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

export type RotatedSession = {
  payload: SessionCookiePayload;
  tokens: SessionTokens;
  /** SESSION-LOSS-01: выдан повторно уже существующий преемник. */
  reissued: boolean;
};
type RefreshTokenClaims = {
  sub: string;
  sid: string;
  jti: string;
};

export type RefreshSessionRevokeResult =
  | "NO_TOKEN"
  | "INVALID_TOKEN"
  | "REVOKED"
  | "ALREADY_INACTIVE";

function parseCookieHeader(header: string | null): Record<string, string> {
  if (!header) return {};
  const entries = header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf("=");
      if (idx < 0) return [part, ""] as const;
      return [part.slice(0, idx).trim(), part.slice(idx + 1).trim()] as const;
    });
  return Object.fromEntries(entries);
}

function parseAccessTokenPayload(token: string | null | undefined): SessionPayload | null {
  if (!token) return null;
  return verifyToken(token, "access");
}

/**
 * SEC-13 — access-токен действителен, только пока жива его СЕМЬЯ сессий.
 *
 * Раньше проверялся лишь флаг удаления пользователя, поэтому «завершить все
 * остальные сессии» и logout гасили только refresh-строки: украденный
 * access-токен продолжал работать до истечения своих 2 часов. Для человека,
 * который жмёт эту кнопку ИМЕННО потому, что подозревает компрометацию, это
 * ровно то окно, в котором злоумышленник ещё внутри.
 *
 * Привязка идёт к `familyId`, а не к `RefreshSession.id`: ротация помечает
 * старую строку `revokedAt` и создаёт новую, так что привязка к строке
 * обнуляла бы живой access-токен при каждом обновлении сессии. Семья же
 * наследуется по цепочке ротации и умирает только от явного отзыва.
 *
 * Токены без `fid` (выпущенные до SEC-13) проходят как legacy — иначе деплой
 * разлогинил бы всех разом. Они живут не дольше своего TTL.
 */
/**
 * PERF-23 — что именно нужно вызывающим от «текущего пользователя».
 *
 * Запрос шёл без `select`, то есть на КАЖДЫЙ аутентифицированный запрос (а
 * `getSessionUser` стоит практически в каждом защищённом роуте и в SSR
 * публичных страниц) из БД приезжала вся строка `UserProfile` — тридцать с
 * лишним колонок, включая адрес, ФИО, даты блокировки и причину блокировки,
 * которых сессии не нужно ничего.
 *
 * Список ниже — не догадка: он выведен компилятором. Prisma сужает тип
 * результата по `select`, поэтому любой потребитель, читающий поле не из
 * этого списка, валит `typecheck`. То есть полнота списка проверяется
 * гейтом, а не ревью, и новое поле нельзя начать читать молча.
 */
const SESSION_USER_SELECT = {
  id: true,
  roles: true,
  phone: true,
  // PHONE-CLAIM-01: потребители, для которых телефон — ключ матчинга (инвайты,
  // бейдж/центр уведомлений), обязаны отличать владение от заявки.
  phoneVerifiedAt: true,
  email: true,
  emailVerifiedAt: true,
  displayName: true,
  firstName: true,
  lastName: true,
  publicUsername: true,
  telegramId: true,
  externalPhotoUrl: true,
  isDeleted: true,
} as const;

/**
 * Пользователь текущей сессии. Именно этот тип обязаны принимать хелперы,
 * которым его передают: объявленный в сигнатуре полный `UserProfile` —
 * это тихое требование прочитать из БД всё, даже если функция читает `roles`.
 */
export type SessionUser = Prisma.UserProfileGetPayload<{
  select: typeof SESSION_USER_SELECT;
}>;

async function loadActiveSessionUser(userId: string, familyId?: string | null) {
  return prisma.userProfile.findFirst({
    where: {
      id: userId,
      isDeleted: false,
      ...(familyId
        ? { refreshSessions: { some: { familyId, revokedAt: null } } }
        : {}),
    },
    select: SESSION_USER_SELECT,
  });
}

/**
 * MOBILE-AUTH-A — обе точки чтения сессии принимают `Authorization: Bearer`
 * наравне с кукой `bh_session`; заявлена схема Bearer — решает заголовок
 * (`selectAccessToken`, правило — в `bearer.ts`). Проверка у обоих
 * транспортов одна: `parseAccessTokenPayload` (тип, подпись, срок) и
 * `loadActiveSessionUser` (живой пользователь + живая семья, SEC-13).
 */
async function getAccessSessionPayload(): Promise<SessionPayload | null> {
  const headerStore = await headers();
  const authorization = headerStore.get("authorization");
  if (isBearerAuthorization(authorization)) {
    return parseAccessTokenPayload(selectAccessToken(authorization, null));
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(getAccessCookieName())?.value;
  return parseAccessTokenPayload(token);
}

export function getAccessTokenFromRequest(req: Request): string | null {
  const allCookies = parseCookieHeader(req.headers.get("cookie"));
  return selectAccessToken(req.headers.get("authorization"), allCookies[getAccessCookieName()]);
}

export async function getSessionUserFromRequest(req: Request) {
  const payload = parseAccessTokenPayload(getAccessTokenFromRequest(req));
  if (!payload?.sub) return null;
  return loadActiveSessionUser(payload.sub, payload.fid);
}

function buildRefreshExpiresAt(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
}

function parseRefreshTokenClaims(refreshToken: string): RefreshTokenClaims | null {
  const payload = verifyToken(refreshToken, "refresh");
  if (!payload?.sub || !payload.sid || !payload.jti) return null;
  return {
    sub: payload.sub,
    sid: payload.sid,
    jti: payload.jti,
  };
}

function setAccessCookie(response: NextResponse, accessToken: string): void {
  response.cookies.set(getAccessCookieName(), accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: ACCESS_COOKIE_MAX_AGE_SECONDS,
  });
}

function expireLegacyRefreshCookie(response: NextResponse): void {
  // `cookies.set` держит одну запись на имя, поэтому второй `Set-Cookie` с тем
  // же именем, но другим путём дописывается в заголовки напрямую.
  const secure = isSecureCookie() ? "; Secure" : "";
  response.headers.append(
    "set-cookie",
    `${REFRESH_COOKIE_NAME}=; Path=${LEGACY_REFRESH_COOKIE_PATH}; Max-Age=0; HttpOnly; SameSite=Lax${secure}`,
  );
}

function setRefreshCookie(response: NextResponse, refreshToken: string): void {
  response.cookies.set(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  });
  expireLegacyRefreshCookie(response);
}

function earliest(a: Date, b: Date | null | undefined): Date {
  return b && b.getTime() < a.getTime() ? b : a;
}

/**
 * MOBILE-AUTH-A — метаданные, которые новая строка семьи получает от
 * предыдущей (ротация) с поверх-наложением свежих заголовков клиента
 * (обновлённое приложение шлёт новую `X-App-Version`). В `data` попадают только
 * заданные значения: у веб-строк меты нет, и запись остаётся прежней формы.
 */
type StoredSessionMeta = Partial<SessionDeviceMeta> & { clientType?: SessionClientType | null };

function deviceMetaData(
  previous: StoredSessionMeta | null | undefined,
  override?: Partial<SessionDeviceMeta>,
): Partial<SessionDeviceMeta> {
  const data: Partial<SessionDeviceMeta> = {};
  for (const key of SESSION_DEVICE_META_KEYS) {
    const value = override?.[key] ?? previous?.[key] ?? null;
    if (value !== null) data[key] = value;
  }
  return data;
}

function carriedSessionMeta(
  previous: StoredSessionMeta | null | undefined,
  override?: Partial<SessionDeviceMeta>,
): Partial<SessionDeviceMeta> & { clientType?: SessionClientType } {
  return {
    ...(previous?.clientType ? { clientType: previous.clientType } : {}),
    ...deviceMetaData(previous, override),
  };
}

const SESSION_META_SELECT = {
  clientType: true,
  platform: true,
  appVersion: true,
  deviceName: true,
  installationId: true,
  userAgent: true,
} as const;

function surfaceOperation(clientType: SessionClientType | null | undefined, operation: string): string {
  // Мобильные выдачи/ротации — отдельные метки: по ним видно, как живёт
  // приложение, и веб-дашборды `refresh-rotate` / `session-issue` не меняются.
  return clientType === "MOBILE" ? `mobile-${operation}` : operation;
}

/**
 * MOBILE-AUTH-A — выдача новой сессии без транспорта: строка `RefreshSession`
 * (новая семья) + пара токенов. Веб-адаптер — `setSessionCookies`.
 */
export async function issueSession(
  payload: SessionCookiePayload,
  meta?: SessionIssueMeta,
): Promise<SessionTokens> {
  // SEC-13: новая сессия = новая семья. Идентификатор генерируем сами, а не
  // берём id строки, — тогда хватает одного запроса и семья остаётся
  // самостоятельным понятием, а не псевдонимом первой строки цепочки.
  const familyId = crypto.randomUUID();
  const refreshExpiresAt = buildRefreshExpiresAt();
  const refreshSession = await prisma.refreshSession.create({
    data: {
      userId: payload.sub,
      jti: crypto.randomUUID(),
      familyId,
      expiresAt: refreshExpiresAt,
      lastUsedAt: new Date(),
      ...(meta ? carriedSessionMeta(meta) : {}),
    },
    select: {
      id: true,
      jti: true,
    },
  });

  const access = signAccessTokenWithExpiry({ ...payload, fid: familyId });
  const refresh = signRefreshTokenWithExpiry({
    sub: payload.sub,
    sid: refreshSession.id,
    jti: refreshSession.jti,
  });

  void recordSurfaceEvent({
    surface: "auth",
    outcome: "success",
    operation: surfaceOperation(meta?.clientType, "session-issue"),
  });

  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken: refresh.token,
    refreshTokenExpiresAt: earliest(refresh.expiresAt, refreshExpiresAt),
  };
}

/**
 * MOBILE-AUTH-A3 — User-Agent браузера для списка сессий. Читается из
 * request-контекста (`headers()`), как и сама сессия в `getSessionUser`; вне
 * запроса (скрипты, тесты) контекста нет — сессия выдаётся без меты, как до A3.
 * Ротация наследует мету семьи, так что UA пишется один раз, при входе.
 */
async function readWebIssueMetaFromRequest(): Promise<SessionIssueMeta | undefined> {
  try {
    return readWebSessionIssueMeta(await headers());
  } catch {
    return undefined;
  }
}

export async function setSessionCookies(response: NextResponse, payload: SessionCookiePayload): Promise<void> {
  const tokens = await issueSession(payload, await readWebIssueMetaFromRequest());
  setAccessCookie(response, tokens.accessToken);
  setRefreshCookie(response, tokens.refreshToken);
}

export function setAccessSessionCookie(response: NextResponse, payload: SessionCookiePayload): void {
  const accessToken = signAccessToken(payload);
  setAccessCookie(response, accessToken);
}

/**
 * SESSION-LOSS-01 (2026-09-23) — отставший на ОДИН шаг refresh-токен
 * восстанавливает сессию, а не выкидывает на `/login`.
 *
 * Ротация одноразовая: предъявленный токен помечается использованным, а новый
 * уезжает к браузеру в `Set-Cookie` ответа. Если этот ответ до браузера не
 * дошёл — мобильная сеть оборвалась, приложение свернули посреди запроса,
 * параллельный запрос проиграл гонку, — браузер остаётся с уже использованным
 * токеном. Прежняя защита (SESSION-REFRESH-PATH-01) прощала это только 20
 * секунд и при этом выдавала проигравшему лишь access-токен, НЕ новую
 * refresh-куку, — то есть рассчитывала, что ответ победителя дойдёт. Не дошёл —
 * через два часа (следующее протухание access-токена) вылет на `/login`.
 * Воспроизведено: один потерянный ответ → `/login` (`.qa/diagnostics/session-loss`).
 *
 * Теперь: предъявлен использованный токен, а его ПРЕЕМНИК ещё не использован и
 * жив — значит, клиент просто не получил ответ. Ему повторно выдаётся тот же
 * преемник (refresh + access), срок не ограничен окном. Отставание на два шага
 * и больше (преемник уже использован) по-прежнему отказ: клиент ту куку
 * получал и сам же её предъявлял, старый токен — не его обычное состояние.
 *
 * Цена для безопасности: тот, кто украл уже использованный токен, может
 * получить преемника, пока законный клиент его не использовал. Украсть
 * httpOnly + Secure куку — уже компрометация сессии целиком (неиспользованный
 * токен давал то же самое и раньше), а обнаружения повторного использования с
 * отзывом семьи в проекте не было и до этого.
 */

/**
 * MOBILE-AUTH-A — `deviceMeta`: свежие заголовки мобильного клиента, которые
 * ложатся поверх унаследованной меты семьи (новая версия приложения после
 * обновления). Веб зовёт без неё — строка наследует то, что было.
 * `lastUsedAt` ставится и новой строке, и повторно выданному преемнику.
 */
export async function rotateSession(
  refreshToken: string,
  options?: { deviceMeta?: Partial<SessionDeviceMeta> },
): Promise<RotatedSession | null> {
  const claims = parseRefreshTokenClaims(refreshToken);
  if (!claims) return null;

  const deviceMeta = options?.deviceMeta;
  const now = new Date();
  const rotated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.refreshSession.updateMany({
      where: {
        id: claims.sid,
        userId: claims.sub,
        jti: claims.jti,
        revokedAt: null,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) {
      // SESSION-LOSS-01: токен уже использован — выдаём его преемника повторно,
      // если тот ещё не использован и жив (клиент не получил ответ ротации).
      const used = await tx.refreshSession.findFirst({
        where: {
          id: claims.sid,
          userId: claims.sub,
          jti: claims.jti,
          revokedAt: null,
          rotatedToSessionId: { not: null },
        },
        select: { familyId: true, rotatedToSessionId: true },
      });
      if (!used?.rotatedToSessionId) return null;
      const successor = await tx.refreshSession.findFirst({
        where: {
          id: used.rotatedToSessionId,
          userId: claims.sub,
          revokedAt: null,
          usedAt: null,
          expiresAt: { gt: now },
        },
        select: { id: true, jti: true, familyId: true, expiresAt: true, clientType: true },
      });
      if (!successor) return null;
      const reissueUser = await tx.userProfile.findFirst({
        where: { id: claims.sub, isDeleted: false },
        select: { id: true, phone: true, roles: true },
      });
      if (!reissueUser) return null;
      // Метаданные преемника уже унаследованы при его создании; освежаем
      // только «когда пользовались» и то, что прислал клиент сейчас.
      await tx.refreshSession.update({
        where: { id: successor.id },
        data: { lastUsedAt: now, ...deviceMetaData(null, deviceMeta) },
      });
      return {
        user: reissueUser,
        nextSession: { id: successor.id, jti: successor.jti },
        familyId: successor.familyId ?? used.familyId ?? claims.sid,
        refreshExpiresAt: successor.expiresAt,
        clientType: successor.clientType,
        reissued: true,
      };
    }

    const user = await tx.userProfile.findFirst({
      where: { id: claims.sub, isDeleted: false },
      select: { id: true, phone: true, roles: true },
    });
    if (!user) {
      await tx.refreshSession.updateMany({
        where: { id: claims.sid, revokedAt: null },
        data: { revokedAt: now },
      });
      return null;
    }

    // SEC-13: ротация продолжает ТУ ЖЕ семью, иначе живой access-токен
    // умирал бы при каждом обновлении сессии. Строки, выпущенные до миграции,
    // семьи не имеют — для них семьёй становится их собственный id, так что
    // цепочка получает её со следующей ротации и дальше уже отзываема.
    // MOBILE-AUTH-A: тем же чтением забирается мета семьи — новая строка её
    // наследует (клиент, платформа, установка), иначе после первой же ротации
    // «где я вошёл» терял бы устройство.
    const claimedSession = await tx.refreshSession.findUnique({
      where: { id: claims.sid },
      select: { familyId: true, ...SESSION_META_SELECT },
    });
    const familyId = claimedSession?.familyId ?? claims.sid;
    const refreshExpiresAt = buildRefreshExpiresAt();

    const nextSession = await tx.refreshSession.create({
      data: {
        userId: user.id,
        jti: crypto.randomUUID(),
        familyId,
        expiresAt: refreshExpiresAt,
        lastUsedAt: now,
        ...carriedSessionMeta(claimedSession, deviceMeta),
      },
      select: { id: true, jti: true },
    });

    await tx.refreshSession.update({
      where: { id: claims.sid },
      data: { rotatedToSessionId: nextSession.id },
    });

    return {
      user,
      nextSession,
      familyId,
      refreshExpiresAt,
      clientType: claimedSession?.clientType ?? null,
      reissued: false,
    };
  });

  if (!rotated) return null;

  const payload: SessionCookiePayload = {
    sub: rotated.user.id,
    phone: rotated.user.phone ?? null,
    roles: rotated.user.roles,
  };
  const access = signAccessTokenWithExpiry({ ...payload, fid: rotated.familyId });
  const refresh = signRefreshTokenWithExpiry({
    sub: rotated.user.id,
    sid: rotated.nextSession.id,
    jti: rotated.nextSession.jti,
  });

  void recordSurfaceEvent({
    surface: "auth",
    outcome: "success",
    // Повторная выдача преемника — отдельная метка: по ней видно, как часто
    // ответ ротации до клиента не доходит.
    operation: surfaceOperation(
      rotated.clientType,
      rotated.reissued ? "refresh-rotate-reissue" : "refresh-rotate",
    ),
  });

  return {
    payload,
    tokens: {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: refresh.token,
      // Повторно выданный преемник живёт до срока СВОЕЙ строки, а не 30 дней
      // от момента подписи.
      refreshTokenExpiresAt: earliest(refresh.expiresAt, rotated.refreshExpiresAt),
    },
    reissued: rotated.reissued,
  };
}

export async function rotateSessionCookies(
  response: NextResponse,
  refreshToken: string
): Promise<SessionCookiePayload | null> {
  const rotated = await rotateSession(refreshToken);
  if (!rotated) return null;
  setAccessCookie(response, rotated.tokens.accessToken);
  setRefreshCookie(response, rotated.tokens.refreshToken);
  return rotated.payload;
}

export async function revokeRefreshSessionByToken(
  refreshToken: string | null | undefined
): Promise<RefreshSessionRevokeResult> {
  if (!refreshToken) return "NO_TOKEN";
  const claims = parseRefreshTokenClaims(refreshToken);
  if (!claims) return "INVALID_TOKEN";

  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.refreshSession.findFirst({
      where: {
        id: claims.sid,
        userId: claims.sub,
        jti: claims.jti,
      },
      select: {
        id: true,
        rotatedToSessionId: true,
        familyId: true,
      },
    });
    if (!session) {
      return "ALREADY_INACTIVE" as const;
    }

    const chainIds: string[] = [];
    const seenIds = new Set<string>();
    let cursorId: string | null = session.id;
    while (cursorId && !seenIds.has(cursorId)) {
      seenIds.add(cursorId);
      chainIds.push(cursorId);
      const nextSession: { rotatedToSessionId: string | null } | null = await tx.refreshSession.findUnique({
        where: { id: cursorId },
        select: { rotatedToSessionId: true },
      });
      cursorId = nextSession?.rotatedToSessionId ?? null;
    }

    // Выход гасит ВСЮ семью (SEC-13: семья = один вход/устройство), а не
    // только цепочку вперёд от предъявленного токена. Ротация помечает
    // предшественника `usedAt`, но не `revokedAt`, а проверка access-токена
    // (`loadActiveSessionUser`) принимает семью, пока в ней есть хоть одна
    // неотозванная строка, — то есть использованный предшественник держал
    // украденный access-токен живым до конца его двух часов. С SESSION-LOSS-01
    // вдобавок использованный токен восстанавливает сессию через неиспользованного
    // преемника; отзыв семьи закрывает и этот путь.
    const revoked = await tx.refreshSession.updateMany({
      where: {
        revokedAt: null,
        OR: [
          { id: { in: chainIds } },
          ...(session.familyId ? [{ userId: claims.sub, familyId: session.familyId }] : []),
        ],
      },
      data: {
        revokedAt: new Date(),
      },
    });
    // MOBILE-B2: выход отвязывает push-токены установки этой семьи — в той же
    // транзакции (повторный выход идемпотентен: строк уже нет). Устройства
    // привязываются только к семье (`fid`), у legacy-строк их не бывает.
    if (session.familyId) {
      await unlinkPushDevicesOfFamilies(tx, claims.sub, [session.familyId]);
    }
    return revoked.count > 0 ? ("REVOKED" as const) : ("ALREADY_INACTIVE" as const);
  });
  return result;
}

export async function revokeAndClearSessionCookies(
  response: NextResponse,
  refreshToken: string | null | undefined
): Promise<RefreshSessionRevokeResult> {
  const result = await revokeRefreshSessionByToken(refreshToken);
  clearSessionCookies(response);
  return result;
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.set(getAccessCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: 0,
  });

  response.cookies.set(REFRESH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: REFRESH_COOKIE_PATH,
    maxAge: 0,
  });
  expireLegacyRefreshCookie(response);
}

/**
 * SEC-13 — id тоже обязан проходить проверку сессии.
 *
 * Эта функция возвращала `payload.sub` прямо из токена, вообще не заглядывая в
 * БД: ни отзыв сессии, ни даже удаление аккаунта на неё не действовали. Живой
 * смоук поймал это на `/api/me` — устройство, у которого только что отозвали
 * сессию, продолжало отвечать 200, потому что этот путь шёл мимо
 * `loadActiveSessionUser`. Выбираем только `id`, чтобы не тянуть всю строку
 * профиля ради одного поля.
 */
export async function getSessionUserId(): Promise<string | null> {
  const payload = await getAccessSessionPayload();
  if (!payload?.sub) return null;
  const user = await prisma.userProfile.findFirst({
    where: {
      id: payload.sub,
      isDeleted: false,
      ...(payload.fid
        ? { refreshSessions: { some: { familyId: payload.fid, revokedAt: null } } }
        : {}),
    },
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function getSessionUser() {
  const payload = await getAccessSessionPayload();
  if (!payload?.sub) return null;
  return loadActiveSessionUser(payload.sub, payload.fid);
}

/**
 * MOBILE-AUTH-A3 — пользователь сессии ВМЕСТЕ с семьёй, которой предъявлен
 * токен (`fid`). Нужна списку сессий: «это устройство» = семья текущего
 * access-токена, а не догадка по User-Agent. Проверка та же, что у
 * `getSessionUser`; legacy-токен без `fid` даёт `familyId: null` — у него
 * «текущей» строки в списке нет.
 */
export async function getSessionContext(): Promise<{ user: SessionUser; familyId: string | null } | null> {
  const payload = await getAccessSessionPayload();
  if (!payload?.sub) return null;
  const user = await loadActiveSessionUser(payload.sub, payload.fid);
  return user ? { user, familyId: payload.fid ?? null } : null;
}
