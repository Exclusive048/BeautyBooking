import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * LOGIC-09 — пакетная бронь идемпотентна (инв. #28).
 *
 * Пакетные `/book`-роуты не читали `x-idempotency-key`, а сами создатели
 * пакета такого параметра не имели вовсе — в отличие от `createBooking`.
 * Дубля пакета это не давало: второй запрос упирался в `ensureNoConflicts`
 * уже созданных сиблингов. Но ответом был 409 «Это время уже занято.
 * Пожалуйста, выберите другое окошко» — то есть пользователь, чей пакет ТОЛЬКО
 * ЧТО успешно создан, шёл выбирать другое время.
 *
 * Ключевое отличие от одиночной брони: кэшируется `bookingPackageId`, и
 * повтор обязан вернуть ВЕСЬ пакет (N броней), а не одну запись.
 */

const store = vi.hoisted(() => new Map<string, unknown>());
const state = vi.hoisted(() => ({
  packageRow: null as { id: string; totalKopeks: number; bookings: { id: string }[] } | null,
}));
const spies = vi.hoisted(() => ({ packageFindFirst: vi.fn() }));

vi.mock("@/lib/cache/cache", () => ({
  get: async (key: string) => store.get(key) ?? null,
  set: async (key: string, value: unknown) => {
    store.set(key, value);
  },
  del: async (key: string) => {
    store.delete(key);
  },
  setNx: async (key: string, value: string) => {
    if (store.has(key)) return false;
    store.set(key, JSON.parse(value));
    return true;
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bookingPackage: {
      // Фильтр честный: иначе тест на legacy-запись прошёл бы и с
      // `id: undefined`, то есть перестал бы что-либо проверять.
      findFirst: async (args: { where: { id?: string; clientUserId: string | null } }) => {
        spies.packageFindFirst(args);
        if (!state.packageRow) return null;
        return args.where.id === state.packageRow.id ? state.packageRow : null;
      },
    },
  },
}));

import {
  abortPackageIdempotency,
  beginPackageIdempotency,
  completePackageIdempotency,
} from "@/lib/bookings/package-idempotency";

const GUEST = { idempotencyKey: "req-1", clientUserId: null, clientPhone: "+79995000000" };

beforeEach(() => {
  store.clear();
  state.packageRow = { id: "pkg-1", totalKopeks: 500_000, bookings: [{ id: "b1" }, { id: "b2" }] };
  spies.packageFindFirst.mockClear();
});

describe("LOGIC-09 · повтор возвращает ТОТ ЖЕ пакет", () => {
  it("второй запрос с тем же ключом отдаёт весь пакет и не берёт замок", async () => {
    const first = await beginPackageIdempotency(GUEST);
    expect(first.cached).toBeNull();
    expect(first.heldKey).not.toBeNull();
    await completePackageIdempotency(first.heldKey, "pkg-1");

    const second = await beginPackageIdempotency(GUEST);

    // Весь пакет, а не одна бронь — иначе клиент увидит одну запись из трёх.
    expect(second.cached).toEqual({
      bookingPackageId: "pkg-1",
      bookingIds: ["b1", "b2"],
      totalKopeks: 500_000,
    });
    expect(second.heldKey).toBeNull();
  });

  it("ключ отнесён к клиенту: чужой телефон не читает чужой пакет", async () => {
    const first = await beginPackageIdempotency(GUEST);
    await completePackageIdempotency(first.heldKey, "pkg-1");

    const other = await beginPackageIdempotency({ ...GUEST, clientPhone: "+79995000001" });
    expect(other.cached).toBeNull();
    expect(other.heldKey).not.toBeNull();
  });

  it("замок держится: параллельный запрос получает 409 DUPLICATE_REQUEST", async () => {
    await beginPackageIdempotency(GUEST);
    await expect(beginPackageIdempotency(GUEST)).rejects.toMatchObject({
      status: 409,
      code: "DUPLICATE_REQUEST",
    });
  });

  it("без ключа идемпотентность не включается (совместимость существующих клиентов)", async () => {
    const guard = await beginPackageIdempotency({ ...GUEST, idempotencyKey: null });
    expect(guard).toEqual({ cached: null, heldKey: null });
    expect(spies.packageFindFirst).not.toHaveBeenCalled();
  });
});

describe("LOGIC-09 · честная ошибка не запирает пользователя на 10 минут", () => {
  it("после снятия замка тот же ключ снова рабочий", async () => {
    const first = await beginPackageIdempotency(GUEST);
    await abortPackageIdempotency(first.heldKey);

    const retry = await beginPackageIdempotency(GUEST);
    expect(retry.cached).toBeNull();
    expect(retry.heldKey).not.toBeNull();
  });
});

describe("LOGIC-09 · записи прошлой формы читаются после деплоя", () => {
  it("запись с полем bookingId разрешается как готовый результат", async () => {
    // Такие записи живут в Redis ещё TTL после выкатки; без совместимости
    // идемпотентность молча отключилась бы ровно на это окно.
    const probe = await beginPackageIdempotency(GUEST);
    const key = probe.heldKey!;
    store.set(key, { status: "done", bookingId: "pkg-1" });

    const replay = await beginPackageIdempotency(GUEST);
    expect(replay.cached?.bookingPackageId).toBe("pkg-1");
  });
});

/**
 * Структурный слой: сама механика выше проходит и в вакууме, поэтому отдельно
 * пиннится, что её включили в оба пакетных пути и оба роута. Корневая причина
 * находки была именно в этом — параметра не существовало.
 */
const SRC = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

describe("LOGIC-09 · оба пакетных пути и оба роута проведены через guard", () => {
  it.each([
    ["lib/bookings/package-booking.ts", "createSoloPackageBookingUnguarded"],
    ["lib/bookings/package-booking-studio.ts", "createStudioPackageBookingUnguarded"],
  ])("%s берёт замок и снимает его при ошибке", (file, inner) => {
    const source = read(file);
    // Именно ВЫЗОВЫ, а не строки импорта — иначе assert проходит по импорту
    // даже после того, как guard из тела убрали.
    expect(source).toMatch(/await beginPackageIdempotency\(\{/);
    expect(source).toContain("if (guard.cached) return guard.cached;");
    expect(source).toMatch(/await completePackageIdempotency\(guard\.heldKey,/);
    expect(source).toMatch(/await abortPackageIdempotency\(guard\.heldKey\)/);
    // Тело осталось нетронутым и вызывается из обёртки.
    expect(source).toMatch(new RegExp(`await ${inner}\\(input\\)`));
  });

  it.each([
    "app/api/public/packages/[id]/book/route.ts",
    "app/api/public/packages/[id]/studio/book/route.ts",
  ])("%s читает заголовок и передаёт его дальше", (file) => {
    const source = read(file);
    expect(source).toContain('req.headers.get("x-idempotency-key")');
    expect(source).toMatch(/^\s*idempotencyKey,$/m);
  });

  it.each([
    "features/public-profile/master/components/package-booking-flow.tsx",
    "features/public-studio/components/studio-package-flow.tsx",
  ])("%s отправляет заголовок (иначе сервер нечего проверять)", (file) => {
    expect(read(file)).toContain('"x-idempotency-key": idempotencyKeyRef.current');
  });
});
