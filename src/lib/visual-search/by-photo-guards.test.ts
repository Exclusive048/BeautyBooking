// SEC-04 by-photo (AUDIT-CAMPAIGN-02 п.7) — guard-тесты дедупа.
// Кэш дедупа гоняется на memory-fallback'е (REDIS_URL пуст в тестовом env).
//
// FIX-B16: тесты СУТОЧНОГО БЮДЖЕТА уехали отсюда в `lib/ai/spend-ceiling.test.ts`
// вместе с самим механизмом. Заметьте, ЧТО именно приходилось писать в шапке
// прежней версии этого файла: «без Redis не-prod `checkRateLimit` БЕЗ СЧЁТА
// fail-open, то есть настоящий счёт в тестовом env недостижим» — поэтому потолок
// проверялся counting-fake'ом поверх `vi.mock`, то есть проверялась проводка к
// лимитеру, а не способность потолка удержать. Это и был симптом: механизм,
// который не может посчитать без Redis, не может и ограничить без Redis.
// Durable-счётчик считает по-настоящему, и его тесты — поведенческие.
import { describe, expect, it } from "vitest";
import {
  byPhotoImageHash,
  getCachedByPhotoResult,
  setCachedByPhotoResult,
} from "@/lib/visual-search/by-photo-guards";
import type { VisualSearchHttpResponse } from "@/lib/visual-search/contracts";

describe("дедуп по хешу изображения", () => {
  it("хеш стабилен для тех же байтов и различен для разных", () => {
    const a = byPhotoImageHash(new Uint8Array([1, 2, 3]));
    const b = byPhotoImageHash(new Uint8Array([1, 2, 3]));
    const c = byPhotoImageHash(new Uint8Array([1, 2, 4]));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("set → get возвращает сохранённый ответ; незнакомый хеш — null", async () => {
    const hash = byPhotoImageHash(new Uint8Array([9, 9, 9]));
    const stored: VisualSearchHttpResponse = {
      ok: false,
      reason: "unrecognized",
      message: "проба",
    } as VisualSearchHttpResponse;
    await setCachedByPhotoResult(hash, stored);
    const roundTrip = await getCachedByPhotoResult(hash);
    expect(roundTrip).toEqual(stored);
    expect(await getCachedByPhotoResult(byPhotoImageHash(new Uint8Array([7])))).toBeNull();
  });
});
