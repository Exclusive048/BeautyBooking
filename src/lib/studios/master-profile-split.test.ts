import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * STUDIO-MASTER-PROFILES (этап 4, решение владельца: отзывы о визитах в студию
 * — только в профиле студии). Отзыв о записи на поверхности студии, адресованный
 * ЛИЧНОМУ профилю мастера, переезжает в студию с исполнителем = профилем в
 * студии; отзыв о личной записи остаётся личным.
 *
 * Найдено живой проверкой на dev: первая версия разделения переносила только
 * отзывы о записях «студийная услуга на личной странице», и три отзыва о
 * визитах в студию остались в личном рейтинге мастера (4.7 · 3 у личного
 * профиля, 0 у профиля в студии).
 *
 * Таблица отзывов здесь — строки в памяти, фильтр `where` исполняется, а не
 * сравнивается с образцом: проверяется, КАКИЕ отзывы уехали.
 *
 * @probe 2026-09-27 — из общего условия `studioVisitReviewsOfPersonalWhere`
 * снят фильтр `booking: { is: { providerId } }`: краснеют 4 из 5 — «уезжает в
 * студию» и «переносит отзывы уже разделённых» (уехало 2 вместо 1), «отзыв о
 * личной записи остаётся личным» (личный отзыв уехал в студию), «на чистых
 * данных транзакций нет» (сверка нашла личный отзыв). Зелёным остаётся только
 * «идемпотентно» — ожидаемо. Первая проба (до выноса условия в одну функцию)
 * оставила зелёной и сверку: она считала кандидатов СВОЕЙ копией фильтра —
 * отсюда общее условие. Возвращено — зелёный.
 */

const recalculateTargetRatings = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/reviews/recalculate-ratings", () => ({ recalculateTargetRatings }));

import { reconcileStudioVisitReviewsWith, retargetStudioVisitReviewsTx } from "./master-profile-split";

type ReviewRow = {
  id: string;
  targetType: "provider" | "studio";
  targetId: string;
  studioId: string | null;
  masterId: string | null;
  bookingProviderId: string | null;
};

type ReviewWhere = {
  targetType?: string;
  targetId?: string;
  booking?: { is?: { providerId?: string } };
};

function matches(row: ReviewRow, where: ReviewWhere): boolean {
  if (where.targetType !== undefined && row.targetType !== where.targetType) return false;
  if (where.targetId !== undefined && row.targetId !== where.targetId) return false;
  const bookingProviderId = where.booking?.is?.providerId;
  if (bookingProviderId !== undefined && row.bookingProviderId !== bookingProviderId) return false;
  return true;
}

function makeReviewTable(rows: ReviewRow[]) {
  return {
    rows,
    updateMany: vi.fn(async ({ where, data }: { where: ReviewWhere; data: Partial<ReviewRow> }) => {
      let count = 0;
      for (const row of rows) {
        if (!matches(row, where)) continue;
        Object.assign(row, data);
        count += 1;
      }
      return { count };
    }),
    count: vi.fn(async ({ where }: { where: ReviewWhere }) => rows.filter((row) => matches(row, where)).length),
  };
}

const PERSONAL = "personal-p";
const STUDIO_PROFILE = "studio-profile-s";
const STUDIO_PROVIDER = "studio-provider";
const STUDIO_ROW = "studio-row";

function seedRows(): ReviewRow[] {
  return [
    // Визит в студию, отзыв адресован мастеру (форма сидов).
    { id: "r-studio-visit", targetType: "provider", targetId: PERSONAL, studioId: STUDIO_ROW, masterId: PERSONAL, bookingProviderId: STUDIO_PROVIDER },
    // Личная запись — отзыв остаётся личным.
    { id: "r-personal", targetType: "provider", targetId: PERSONAL, studioId: null, masterId: null, bookingProviderId: PERSONAL },
    // Отзыв о визите в студию другому мастеру — не наш.
    { id: "r-other", targetType: "provider", targetId: "other-master", studioId: STUDIO_ROW, masterId: null, bookingProviderId: STUDIO_PROVIDER },
  ];
}

beforeEach(() => {
  recalculateTargetRatings.mockClear();
});

describe("retargetStudioVisitReviewsTx", () => {
  it("отзыв о визите в студию уезжает в студию с исполнителем = профилем в студии", async () => {
    const review = makeReviewTable(seedRows());
    const count = await retargetStudioVisitReviewsTx({ review } as never, {
      personalId: PERSONAL,
      studioProfileId: STUDIO_PROFILE,
      studioProviderId: STUDIO_PROVIDER,
      studioRowId: STUDIO_ROW,
    });
    expect(count).toBe(1);
    expect(review.rows.find((row) => row.id === "r-studio-visit")).toMatchObject({
      targetType: "studio",
      targetId: STUDIO_PROVIDER,
      studioId: STUDIO_ROW,
      masterId: STUDIO_PROFILE,
    });
  });

  it("отзыв о личной записи остаётся личным, чужой — не трогается", async () => {
    const review = makeReviewTable(seedRows());
    await retargetStudioVisitReviewsTx({ review } as never, {
      personalId: PERSONAL,
      studioProfileId: STUDIO_PROFILE,
      studioProviderId: STUDIO_PROVIDER,
      studioRowId: STUDIO_ROW,
    });
    expect(review.rows.find((row) => row.id === "r-personal")).toMatchObject({ targetType: "provider", targetId: PERSONAL });
    expect(review.rows.find((row) => row.id === "r-other")).toMatchObject({ targetType: "provider", targetId: "other-master" });
  });

  it("идемпотентно: второй вызов ничего не находит", async () => {
    const review = makeReviewTable(seedRows());
    const input = { personalId: PERSONAL, studioProfileId: STUDIO_PROFILE, studioProviderId: STUDIO_PROVIDER, studioRowId: STUDIO_ROW };
    await retargetStudioVisitReviewsTx({ review } as never, input);
    expect(await retargetStudioVisitReviewsTx({ review } as never, input)).toBe(0);
  });
});

describe("reconcileStudioVisitReviewsWith", () => {
  function makeDb(rows: ReviewRow[]) {
    const review = makeReviewTable(rows);
    const tx = { review, studio: { findUnique: vi.fn(async () => ({ id: STUDIO_ROW })) } };
    const db = {
      review,
      provider: {
        findMany: vi.fn(async () => [
          { id: STUDIO_PROFILE, studioId: STUDIO_PROVIDER, owner: { masterProfile: { providerId: PERSONAL } } },
          // Мастер только студии (личного кабинета нет) — пропускается.
          { id: "studio-only", studioId: STUDIO_PROVIDER, owner: { masterProfile: null } },
        ]),
      },
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<number>) => fn(tx)),
    };
    return { db, review };
  }

  it("переносит отзывы уже разделённых мастеров и пересчитывает оба рейтинга", async () => {
    const { db, review } = makeDb(seedRows());
    const result = await reconcileStudioVisitReviewsWith(db as never);
    expect(result).toEqual({ retargeted: 1, failed: [] });
    expect(review.rows.find((row) => row.id === "r-studio-visit")?.masterId).toBe(STUDIO_PROFILE);
    expect(recalculateTargetRatings).toHaveBeenCalledWith(expect.anything(), {
      targetType: "provider",
      targetId: PERSONAL,
      masterId: null,
    });
    expect(recalculateTargetRatings).toHaveBeenCalledWith(expect.anything(), {
      targetType: "studio",
      targetId: STUDIO_PROVIDER,
      masterId: STUDIO_PROFILE,
    });
  });

  it("сверка: на чистых данных транзакций нет", async () => {
    const rows = seedRows().filter((row) => row.id !== "r-studio-visit");
    const { db } = makeDb(rows);
    const result = await reconcileStudioVisitReviewsWith(db as never);
    expect(result).toEqual({ retargeted: 0, failed: [] });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
