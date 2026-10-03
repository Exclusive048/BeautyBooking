import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-CLIENT-01 (B1) — «Мои отзывы»: карточка отзыва на мастера.
 *
 * Отзыв на мастера адресован `Provider` по `targetId` (`targetType = provider`),
 * а `Review.master` заполняется только у отзыва на студию (мастер, оказавший
 * услугу). Список читал цель из пустой связи — «—», без аватара и ссылки.
 *
 * @probe 2026-10-03 — цель отзыва на мастера снова читается из `r.master`:
 *        покраснел «отзыв на мастера — имя, аватар и адрес из Provider по
 *        targetId» (цель `{ name: "—", avatarUrl: null, publicUsername: null }`).
 *        Возвращено — 3/3.
 */

const reviewFindMany = vi.hoisted(() => vi.fn());
const providerFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: { findMany: reviewFindMany },
    provider: { findMany: providerFindMany },
  },
}));

import { listClientReviews } from "./reviews.service";

function review(overrides: Record<string, unknown> = {}) {
  return {
    id: "rv-1",
    rating: 5,
    text: "Отлично",
    createdAt: new Date("2026-10-01T10:00:00Z"),
    updatedAt: new Date("2026-10-01T10:00:00Z"),
    replyText: null,
    repliedAt: null,
    targetType: "provider",
    targetId: "master-1",
    master: null,
    studio: null,
    booking: { id: "bk-1", serviceItems: [{ titleSnapshot: "Маникюр" }] },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listClientReviews — цель отзыва", () => {
  it("отзыв на мастера — имя, аватар и адрес из Provider по targetId", async () => {
    reviewFindMany.mockResolvedValue([review()]);
    providerFindMany.mockResolvedValue([
      { id: "master-1", name: "Анна", avatarUrl: "/api/media/file/a1", publicUsername: "anna" },
    ]);
    const [item] = await listClientReviews("client-1");
    expect(item?.target).toEqual({
      type: "MASTER",
      id: "master-1",
      name: "Анна",
      avatarUrl: "/api/media/file/a1",
      publicUsername: "anna",
    });
    expect(providerFindMany.mock.calls[0]?.[0]?.where).toEqual({ id: { in: ["master-1"] } });
  });

  it("отзыв на студию — студия из связи, Provider отдельно не читается", async () => {
    reviewFindMany.mockResolvedValue([
      review({
        targetType: "studio",
        targetId: "studio-prov-1",
        master: { id: "studio-master-1", name: "Мастер студии", avatarUrl: null, publicUsername: null },
        studio: {
          provider: { id: "studio-prov-1", name: "Студия «Лак»", avatarUrl: null, publicUsername: "lak" },
        },
      }),
    ]);
    const [item] = await listClientReviews("client-1");
    expect(item?.target).toMatchObject({ type: "STUDIO", id: "studio-prov-1", name: "Студия «Лак»" });
    expect(providerFindMany).not.toHaveBeenCalled();
  });

  it("мастер удалён — прежний запасной вариант: id из targetId, имя «—»", async () => {
    reviewFindMany.mockResolvedValue([review({ targetId: "gone" })]);
    providerFindMany.mockResolvedValue([]);
    const [item] = await listClientReviews("client-1");
    expect(item?.target).toEqual({ type: "MASTER", id: "gone", name: "—", avatarUrl: null, publicUsername: null });
  });
});
