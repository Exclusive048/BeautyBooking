import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-CLIENT-01 — предложения для моделей в приложении.
 *
 *  · G1: `GET /api/public/model-offers/{code}` — то, что рендерит страница
 *    `/models/[code]` (`getPublicModelOffer`), в `data.offer`; не найдено,
 *    закрыто или невозможной формы — 404 `NOT_FOUND`.
 *  · B8: `categoryId` списка принимает `e_…`-id публичного справочника
 *    категорий (декодируется), сырой CUID веба проходит как есть.
 *
 * @probe 2026-10-03 — `.transform(decodePublicId)` снят с `categoryId`:
 *        покраснел «e_…-id категории декодируется» (в сервис ушёл
 *        `e_Y2F0LTE`). Возвращено — зелёный.
 * @probe 2026-10-03 — проверка формы кода убрана: покраснел «код невозможной
 *        формы — 404 без запроса к БД». Возвращено — зелёный.
 */

const getPublicModelOffer = vi.hoisted(() => vi.fn());
const listPublicModelOffers = vi.hoisted(() => vi.fn(async () => ({ items: [], nextPage: null })));

vi.mock("@/lib/model-offers/public.service", () => ({ getPublicModelOffer, listPublicModelOffers }));
vi.mock("@/lib/cities/server-city", () => ({ findActiveCityBySlug: vi.fn(async () => null) }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), getRequestId: () => "req" }));

import { encodePublicId } from "@/lib/public-id";
import { GET as offerRoute } from "./route";
import { GET as listRoute } from "../route";

type Body = { ok: boolean; data?: unknown; error?: { code: string; message: string } };

function getOffer(code: string) {
  return offerRoute(new Request(`http://localhost/api/public/model-offers/${encodeURIComponent(code)}`), {
    params: Promise.resolve({ code }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/public/model-offers/{code}", () => {
  it("найдено — 200, data.offer", async () => {
    const offer = { publicCode: "cmoffer1", dateLocal: "2026-10-10" };
    getPublicModelOffer.mockResolvedValue(offer);
    const res = await getOffer("cmoffer1");
    expect(res.status).toBe(200);
    expect((await res.json()) as Body).toEqual({ ok: true, data: { offer } });
    expect(getPublicModelOffer).toHaveBeenCalledWith("cmoffer1");
  });

  it("не найдено (закрыто, прошло, мастер скрыт) — 404 NOT_FOUND", async () => {
    getPublicModelOffer.mockResolvedValue(null);
    const res = await getOffer("cmgone");
    expect(res.status).toBe(404);
    expect(((await res.json()) as Body).error).toMatchObject({
      code: "NOT_FOUND",
      message: "Предложение не найдено.",
    });
  });

  it("код невозможной формы — 404 без запроса к БД", async () => {
    const res = await getOffer("../../etc");
    expect(res.status).toBe(404);
    expect(getPublicModelOffer).not.toHaveBeenCalled();
  });
});

describe("GET /api/public/model-offers — categoryId", () => {
  it("e_…-id категории декодируется", async () => {
    await listRoute(new Request(`http://localhost/api/public/model-offers?categoryId=${encodePublicId("cat-1")}`));
    expect(listPublicModelOffers).toHaveBeenCalledWith(expect.objectContaining({ categoryId: "cat-1" }));
  });

  it("сырой CUID проходит как есть", async () => {
    await listRoute(new Request("http://localhost/api/public/model-offers?categoryId=cat-1"));
    expect(listPublicModelOffers).toHaveBeenCalledWith(expect.objectContaining({ categoryId: "cat-1" }));
  });
});
