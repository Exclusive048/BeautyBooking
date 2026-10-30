import { describe, expect, it, vi } from "vitest";

/**
 * SCRUB-SIGNED-TOKENS (D-04) — предъявительские токены проекта, собранные как
 * `base64url(JSON).HMAC`, не переживают скраббер ни в одной форме, в которой
 * попадают в событие трекера: абсолютный URL запроса, относительный путь
 * хлебной крошки, `transaction`, текст исключения.
 *
 * Токены здесь НАСТОЯЩИЕ — их выпускают сами модули проекта, а не строка,
 * написанная под шаблон. Шаблон, проверенный на собственной выдумке, зеленел
 * бы и тогда, когда настоящий токен устроен иначе (например, подпись короче
 * порога `SIGNED_TOKEN_RE`).
 *
 * @probe 2026-10-30 — по одному, с откатом:
 *   1. убрать из `scrubString` строку `out.replace(SIGNED_TOKEN_RE, …)`
 *      (то есть вернуться к одному `JWT_RE`) → 4 failed: все три формы
 *      `scrubString` и сквозной `scrubEvent`, например «expected 'Request
 *      failed: https://masterryadom.…' not to contain 'eyJiaWQiOiJjbWJvb2tp…'»;
 *   2. поставить `SIGNED_TOKEN_RE` ДО `JWT_RE` → 1 failed: «JWT по-прежнему
 *      исчезает целиком» — «expected 'token [redacted].s3cr3tS1gnatureValue…'
 *      to be 'token [redacted] end'»: от трёхчастного токена оставался хвост.
 */

vi.mock("@/lib/env", () => ({
  env: {
    AUTH_JWT_SECRET: "test-auth-jwt-secret-0123456789abcdef",
    MEDIA_DELIVERY_SECRET: "test-media-delivery-secret-0123456789",
    NODE_ENV: "test",
  },
}));

const { REDACTED, scrubEvent, scrubString } = await import("./scrub");
const { signGuestManageToken, guestManagePath } = await import("@/lib/bookings/guest-manage-token");
const { createChatAttachmentToken, createPrivateMediaDeliveryToken } = await import("@/lib/media/private-delivery");
const { signStudioMasterViewToken } = await import("@/lib/studio/master-view-token");
const { signClientKeyToken } = await import("@/lib/master/client-key-token");

const GUEST = signGuestManageToken("cmbooking0000000000000001");
const CHAT = createChatAttachmentToken("cmasset00000000000000001");
const MEDIA = createPrivateMediaDeliveryToken({ assetId: "cmasset00000000000000002" });
const MASTER_VIEW = signStudioMasterViewToken({ masterId: "cmmaster0000000000000001", studioId: "cmstudio000000000000001" });
const CLIENT_KEY = signClientKeyToken({ clientKey: "phone:+79991000000", masterProviderId: "cmmaster0000000000000001" });

describe("scrubString — двухчастные подписанные токены проекта", () => {
  it("токены действительно двухчастные и начинаются с ey (форма, под которую шаблон)", () => {
    for (const token of [GUEST, CHAT, MEDIA, MASTER_VIEW, CLIENT_KEY]) {
      expect(token.split(".")).toHaveLength(2);
      expect(token.startsWith("ey")).toBe(true);
    }
  });

  it("ссылка «Управлять записью» — в абсолютном URL путь остаётся, токен уходит", () => {
    const out = scrubString(`Request failed: https://masterryadom.ru${guestManagePath(GUEST)}?from=sms`);
    expect(out).not.toContain(GUEST);
    expect(out).toBe(`Request failed: https://masterryadom.ru/booking/manage/${REDACTED}`);
  });

  it("относительный путь API и вложение чата — в тексте исключения", () => {
    const out = scrubString(
      `POST /api/public/bookings/manage/${GUEST}/cancel → 500; GET /api/chat/attachment/${CHAT} → 404`,
    );
    expect(out).not.toContain(GUEST);
    expect(out).not.toContain(CHAT);
    expect(out).toBe(
      `POST /api/public/bookings/manage/${REDACTED}/cancel → 500; GET /api/chat/attachment/${REDACTED} → 404`,
    );
  });

  it("токены в значениях параметров без URL (mt=, view=, client=)", () => {
    const out = scrubString(`mt=${MEDIA} view=${MASTER_VIEW} client=${CLIENT_KEY}`);
    for (const token of [MEDIA, MASTER_VIEW, CLIENT_KEY]) expect(out).not.toContain(token);
  });

  it("JWT по-прежнему исчезает целиком", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEyMyJ9.s3cr3tS1gnatureValue";
    expect(scrubString(`token ${jwt} end`)).toBe(`token ${REDACTED} end`);
  });

  it("коды ошибок, обычные пути и точечные имена не трогаются", () => {
    for (const text of [
      "code=BOOKING_CONFLICT",
      "GET /booking/manage → 404",
      "/api/public/bookings/manage/:token/cancel",
      "at observability.instrumentation.register",
      "category eyebrows.someLongPropertyName",
      "eyelashes.ts:42",
    ]) {
      expect(scrubString(text)).toBe(text);
    }
  });
});

describe("scrubEvent — токен в пути не доходит до трекера ни одним полем", () => {
  it("request.url, transaction, breadcrumb (относительный путь), исключение", () => {
    const event = scrubEvent({
      event_id: "e1",
      transaction: `/booking/manage/${GUEST}`,
      request: { method: "GET", url: `https://masterryadom.ru/booking/manage/${GUEST}` },
      breadcrumbs: [
        { category: "navigation", data: { from: "/", to: `/booking/manage/${GUEST}` } },
        { category: "fetch", data: { url: `/api/public/bookings/manage/${GUEST}/reschedule`, method: "POST" } },
      ],
      exception: { values: [{ type: "Error", value: `render failed at /booking/manage/${GUEST}` }] },
    });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain(GUEST);
    expect(serialized).toContain("/booking/manage/");
  });
});
