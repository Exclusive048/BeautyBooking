import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * LOGIC-30 — серверная проверка телефона на гостевых путях сводилась к длине
 * (`normalizePhone(...)` + `length >= 8`), тогда как клиент требует 10 цифр.
 * Прямой вызов API мимо виджета заводил гостевой профиль (и строку согласия по
 * 152-ФЗ) на строку, телефоном не являющуюся.
 *
 * При разборе нашлось следствие тяжелее самой слабости — РАСХОЖДЕНИЕ КЛЮЧА.
 * `normalizePhone` только чистит разделители и дописывает «+», поэтому
 * «8 999 123-45-67» сохранялся как `+89991234567`, а вход (`^\+7\d{10}$`),
 * склейка и CRM-ключ работают с `+79991234567`. Профиль по такому номеру
 * ищется точным `findUnique`, вариантов не перебирает — значит тот же человек,
 * набравший номер в другом формате, получал ВТОРОЙ пассивный профиль, а
 * согласие оставалось висеть на первом, до которого он не доберётся.
 * (Сами строки броней при этом релинкуются: `buildPhoneVariantsForMatch`
 * перебирает варианты, включая 8-форму. Ломалась именно идентичность профиля.)
 */

const findUnique = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { userProfile: { findUnique, create } },
}));
vi.mock("@/lib/auth/roles", () => ({
  ensureClientRoleForUser: vi.fn(async (_id: string, roles: string[]) => roles),
}));
vi.mock("@/lib/logging/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));

import { findOrCreateGuestUserByPhone } from "@/lib/users/find-or-create-guest";

beforeEach(() => {
  findUnique.mockReset();
  create.mockReset();
  findUnique.mockResolvedValue(null);
  create.mockImplementation(async ({ data }: { data: { phone: string } }) => ({
    id: "u1",
    roles: ["CLIENT"],
    ...data,
  }));
});

describe("гостевой профиль — канонический ключ телефона (LOGIC-30)", () => {
  const CANONICAL = "+79991234567";

  for (const input of ["+79991234567", "89991234567", "79991234567", "+7 (999) 123-45-67"]) {
    it(`«${input}» приводится к ${CANONICAL}`, async () => {
      await findOrCreateGuestUserByPhone({ phone: input });
      expect(findUnique).toHaveBeenCalledWith({ where: { phone: CANONICAL } });
      expect(create.mock.calls[0]?.[0].data.phone).toBe(CANONICAL);
    });
  }

  it("тот же человек в разных форматах — ОДИН ключ, а не два профиля", async () => {
    await findOrCreateGuestUserByPhone({ phone: "8 999 123-45-67" });
    await findOrCreateGuestUserByPhone({ phone: "+7 999 123 45 67" });
    const keys = findUnique.mock.calls.map((call) => call[0].where.phone);
    expect(new Set(keys).size).toBe(1);
  });
});

describe("гостевой профиль — мусор отвергается (LOGIC-30)", () => {
  for (const input of ["12345678", "+123456789", "abcdefgh", "+7999123456", "+799912345678"]) {
    it(`«${input}» не создаёт профиль`, async () => {
      await expect(findOrCreateGuestUserByPhone({ phone: input })).rejects.toMatchObject({
        status: 400,
      });
      expect(create).not.toHaveBeenCalled();
    });
  }
});

describe("гостевые эндпоинты не держат собственной слабой проверки (LOGIC-30)", () => {
  const GUEST_ROUTES = [
    "src/app/api/public/bookings/route.ts",
    "src/app/api/public/packages/[id]/book/route.ts",
    "src/app/api/public/packages/[id]/studio/book/route.ts",
  ];

  for (const file of GUEST_ROUTES) {
    it(`${file} нормализует через общий примитив`, () => {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).toContain("normalizeRussianPhone");
      // прежний порог по длине не должен вернуться
      expect(source).not.toMatch(/phoneNormalized\.length\s*<\s*8/);
      expect(source).not.toContain('from "@/lib/auth/otp"');
    });
  }

  it("чокпоинт создания гостя тоже не судит по длине", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/users/find-or-create-guest.ts"),
      "utf8"
    );
    expect(source).toContain("normalizeRussianPhone");
    expect(source).not.toMatch(/phone\.length\s*<\s*8/);
  });
});
