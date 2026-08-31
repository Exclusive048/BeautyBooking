import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * PHONE-CLAIM-01 (пересматривает пин SECURITY-EXPOSURE-AUDIT-01 #2, решение
 * владельца 2026-08-31) — `PATCH /api/me` снова принимает `phone`, но как
 * ЗАЯВКУ без силы: канонизация на границе разбора, запись только через
 * единственный примитив `claimPhoneForUser` (сброс отметки владения, 409 на
 * занятый номер), и НИКОГДА прямым `data.phone` в `updateMeProfile` — прямой
 * путь обошёл бы и сброс `phoneVerifiedAt`, и освобождение guest-class
 * держателя. Email-инвариант прежний: смена адреса сбрасывает верификацию.
 */

describe("profileUpdateSchema — phone принимается и канонизируется (PHONE-CLAIM-01)", () => {
  it("канонизирует все принятые формы к +7XXXXXXXXXX", async () => {
    const { profileUpdateSchema } = await import("@/lib/users/schemas");
    for (const input of ["+79995559999", "89995559999", "8 999 555-99-99", "+7 (999) 555-99-99"]) {
      const parsed = profileUpdateSchema.parse({ phone: input, firstName: "Иван" });
      expect(parsed.phone).toBe("+79995559999");
      expect(parsed.firstName).toBe("Иван");
    }
  });

  it("пустая строка и null означают «убрать номер»", async () => {
    const { profileUpdateSchema } = await import("@/lib/users/schemas");
    expect(profileUpdateSchema.parse({ phone: "" }).phone).toBeNull();
    expect(profileUpdateSchema.parse({ phone: null }).phone).toBeNull();
  });

  it("не-номер отклоняется на границе разбора", async () => {
    const { profileUpdateSchema } = await import("@/lib/users/schemas");
    for (const input of ["12345678", "+7999555999", "abc", "+123456789012"]) {
      expect(profileUpdateSchema.safeParse({ phone: input }).success).toBe(false);
    }
  });

  it("отсутствующий ключ phone остаётся отсутствующим (не превращается в null-очистку)", async () => {
    const { profileUpdateSchema } = await import("@/lib/users/schemas");
    const parsed = profileUpdateSchema.parse({ firstName: "Иван" });
    expect(parsed.phone).toBeUndefined();
  });

  it("still accepts email (verification is reset at the write layer)", async () => {
    const { profileUpdateSchema } = await import("@/lib/users/schemas");
    const parsed = profileUpdateSchema.parse({ email: "new@example.com" });
    expect(parsed.email).toBe("new@example.com");
  });
});

/**
 * LOGIC-24 — три слоя утверждали разное: схема описывала `displayName` и
 * `address`, роут вырезал их ДВАЖДЫ (из сырого тела и из результата разбора), а
 * `updateMeProfile` их писал. Клиент получал `200 OK` на операцию, которой не
 * было. Решение «эти поля здесь не пишутся» сохранено — убрана его тройная
 * противоречивая запись.
 */
describe("profileUpdateSchema — displayName и address не принимаются (LOGIC-24)", () => {
  it("отбрасывает их ключи", async () => {
    const { profileUpdateSchema } = await import("@/lib/users/schemas");
    const parsed = profileUpdateSchema.parse({
      displayName: "Новое имя",
      address: "Москва, ул. Пушкина, 1",
      firstName: "Иван",
    });
    expect(parsed).not.toHaveProperty("displayName");
    expect(parsed).not.toHaveProperty("address");
    expect(parsed.firstName).toBe("Иван"); // остальные поля не задеты
  });

  it("роут не держит собственных зачисток — иначе слои снова разойдутся", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "src/app/api/me/route.ts"), "utf8");
    expect(source).not.toMatch(/delete\s+\w+\.displayName/);
    expect(source).not.toMatch(/delete\s+\w+\.address/);
  });
});

describe("updateMeProfile — email reset + телефон только через claim-примитив", () => {
  const update = vi.hoisted(() => vi.fn());
  const claimPhone = vi.hoisted(() => vi.fn());

  beforeEach(() => {
    vi.resetModules();
    update.mockReset();
    claimPhone.mockReset();
    claimPhone.mockResolvedValue(undefined);
    update.mockResolvedValue({
      id: "u1",
      roles: ["CLIENT"],
      displayName: null,
      phone: "+70000000000",
      email: "new@example.com",
      externalPhotoUrl: null,
      firstName: null,
      lastName: null,
      middleName: null,
      birthDate: null,
      address: null,
      geoLat: null,
      geoLng: null,
    });
  });

  async function loadWithMocks() {
    vi.doMock("@/lib/prisma", () => ({
      prisma: {
        userProfile: { update },
        masterProfile: { findUnique: vi.fn().mockResolvedValue(null) },
        provider: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    }));
    vi.doMock("@/lib/auth/phone-claim", () => ({
      claimPhoneForUser: claimPhone,
    }));
    vi.doMock("@/lib/logging/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));
    return import("@/lib/users/profile");
  }

  it("resets emailVerifiedAt when email is provided", async () => {
    const { updateMeProfile } = await loadWithMocks();
    await updateMeProfile("u1", { email: "new@example.com" });
    const data = update.mock.calls[0][0].data;
    expect(data.emailVerifiedAt).toBeNull();
  });

  it("does NOT reset emailVerifiedAt when email is absent", async () => {
    const { updateMeProfile } = await loadWithMocks();
    await updateMeProfile("u1", { firstName: "Пётр" });
    const data = update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("emailVerifiedAt");
  });

  it("телефон уходит в claimPhoneForUser и НЕ пишется прямым data.phone", async () => {
    const { updateMeProfile } = await loadWithMocks();
    await updateMeProfile("u1", { email: "new@example.com", phone: "+79995559999" });
    expect(claimPhone).toHaveBeenCalledWith("u1", "+79995559999");
    const data = update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("phone");
  });

  it("без ключа phone claim-примитив не зовётся вовсе", async () => {
    const { updateMeProfile } = await loadWithMocks();
    await updateMeProfile("u1", { firstName: "Пётр" });
    expect(claimPhone).not.toHaveBeenCalled();
  });

  it("не пишет displayName и address даже если они дошли до входа (LOGIC-24)", async () => {
    const { updateMeProfile } = await loadWithMocks();
    await updateMeProfile("u1", {
      firstName: "Пётр",
      displayName: "Новое имя",
      address: "Москва",
    } as never);
    const data = update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("displayName");
    expect(data).not.toHaveProperty("address");
    expect(data.firstName).toBe("Пётр");
  });
});
