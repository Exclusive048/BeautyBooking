import { describe, expect, it } from "vitest";
import type { ProfileDTO } from "@/lib/client-cabinet/profile.service";
import { mergeSavedProfile } from "./merge-saved-profile";

/**
 * PWA-RELOAD-01 — ответ автосейва профиля клиента не перетирает ввод.
 *
 * @probe Возврат прежнего поведения (`mergeSavedProfile` отдаёт `server` как
 * есть): краснеют 3 из 5 — «пробел в конце не исчезает», «набранное во время
 * запроса не откатывается», «телефон остаётся в виде маски».
 */

function profile(overrides: {
  personal?: Partial<ProfileDTO["personal"]>;
  contacts?: Partial<ProfileDTO["contacts"]>;
  completion?: Partial<ProfileDTO["completion"]>;
} = {}): ProfileDTO {
  return {
    personal: {
      firstName: "Анна",
      lastName: "Петрова",
      city: "Москва",
      birthDate: null,
      hideAgeYear: false,
      ...overrides.personal,
    },
    contacts: {
      phone: "+79991234567",
      phoneVerified: true,
      email: null,
      emailVerified: false,
      ...overrides.contacts,
    },
    avatar: { url: null },
    linked: {
      telegram: { linked: false, deliveryEnabled: false, username: null, connectedAt: null },
      vk: { linked: false, deliveryEnabled: false, connectedAt: null },
    },
    stats: { visitsCount: 0, favoritesCount: 0, memberSince: "2026-01-01" },
    completion: {
      percent: 40,
      items: {
        nameLastname: true,
        phoneVerified: true,
        emailVerified: false,
        birthday: false,
        tgLinked: false,
        vkLinked: false,
      },
      ...overrides.completion,
    },
  };
}

describe("mergeSavedProfile", () => {
  it("пробел в конце не исчезает: сервер тримит, поле держит ввод", () => {
    const local = profile({ personal: { city: "Нижний " } });
    const server = profile({ personal: { city: "Нижний" } });
    expect(mergeSavedProfile(server, local).personal.city).toBe("Нижний ");
  });

  it("набранное во время запроса не откатывается к отправленному", () => {
    const local = profile({ personal: { firstName: "Анастасия" } });
    const server = profile({ personal: { firstName: "Анаст" } });
    expect(mergeSavedProfile(server, local).personal.firstName).toBe("Анастасия");
  });

  it("телефон остаётся в виде маски, а не канона сервера", () => {
    const local = profile({ contacts: { phone: "+7 (999) 123-45-67", phoneVerified: false } });
    const server = profile({ contacts: { phone: "+79991234567", phoneVerified: false } });
    expect(mergeSavedProfile(server, local).contacts.phone).toBe("+7 (999) 123-45-67");
  });

  it("вычисляемое берётся из ответа сервера", () => {
    const local = profile({
      contacts: { phone: "+7 (999) 765-43-21", phoneVerified: false },
      completion: { percent: 40 },
    });
    const server = profile({
      contacts: { phone: "+79997654321", phoneVerified: false, emailVerified: true },
      completion: { percent: 60 },
    });
    const merged = mergeSavedProfile(server, local);
    expect(merged.completion.percent).toBe(60);
    expect(merged.contacts.emailVerified).toBe(true);
    expect(merged.contacts.phoneVerified).toBe(false);
  });

  it("без локального состояния — ответ сервера как есть", () => {
    const server = profile();
    expect(mergeSavedProfile(server, undefined)).toBe(server);
  });
});
