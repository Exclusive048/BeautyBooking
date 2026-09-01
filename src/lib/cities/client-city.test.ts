import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * client-city tests run in the default `node` environment — vitest doesn't
 * have jsdom as a dep here. We stub `window` and `document` directly on the
 * global scope and tear them down between tests.
 */

type CookieJar = { value: string };

function installBrowserGlobals(jar: CookieJar) {
  const storage = new Map<string, string>();

  const fakeWindow = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => storage.clear(),
    },
  };

  const fakeDocument = {
    get cookie(): string {
      return jar.value;
    },
    set cookie(next: string) {
      // Simplified cookie write: replace "name=..." pair in the jar.
      const [pair] = next.split(";");
      const eq = pair.indexOf("=");
      if (eq === -1) return;
      const name = pair.slice(0, eq);
      const existing = jar.value
        .split(/;\s*/)
        .filter((part) => part && !part.startsWith(`${name}=`));
      jar.value = [...existing, pair].filter(Boolean).join("; ");
    },
  };

  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("document", fakeDocument);
  return { storage, fakeWindow };
}

describe("client-city", () => {
  let jar: CookieJar;

  beforeEach(() => {
    jar = { value: "" };
    installBrowserGlobals(jar);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getCurrentCitySlug returns null when nothing is set", async () => {
    const { getCurrentCitySlug } = await import("@/lib/cities/client-city");
    expect(getCurrentCitySlug()).toBeNull();
  });

  it("setCurrentCitySlug writes BOTH localStorage AND cookie", async () => {
    const { setCurrentCitySlug, CITY_COOKIE_NAME, CITY_STORAGE_KEY } = await import(
      "@/lib/cities/client-city"
    );

    setCurrentCitySlug("moskva");

    expect(window.localStorage.getItem(CITY_STORAGE_KEY)).toBe("moskva");
    expect(jar.value).toContain(`${CITY_COOKIE_NAME}=moskva`);
  });

  it("getCurrentCitySlug prefers localStorage over cookie", async () => {
    const { getCurrentCitySlug, CITY_COOKIE_NAME, CITY_STORAGE_KEY } = await import(
      "@/lib/cities/client-city"
    );

    // Storage says one thing
    window.localStorage.setItem(CITY_STORAGE_KEY, "storage-city");
    // Cookie says another (older)
    jar.value = `${CITY_COOKIE_NAME}=cookie-city`;

    expect(getCurrentCitySlug()).toBe("storage-city");
  });

  it("getCurrentCitySlug falls back to cookie when localStorage is empty", async () => {
    const { getCurrentCitySlug, CITY_COOKIE_NAME } = await import("@/lib/cities/client-city");

    jar.value = `other=foo; ${CITY_COOKIE_NAME}=krasnodar; another=bar`;

    expect(getCurrentCitySlug()).toBe("krasnodar");
  });

  /**
   * PWA-FIX-01 — «отложенный» попап выбора города.
   *
   * @probe Проба выполнена на правдоподобной форме дефекта, а не на минимальной:
   * возврат к прежнему поведению — это НЕ удаление функции (такое не собралось
   * бы), а `handleClose`, который просто не пишет факт отказа. Смоделировано
   * вызовом `isCityPromptDismissed()` без предшествующего `dismissCityPrompt()`
   * — тест краснеет на «expected false to be true». Отдельно проверено, что
   * отметка ИСТЕКАЕТ: с вечным флагом (сравнение возраста убрано) падает кейс
   * с `now` за пределами TTL.
   */
  describe("city prompt dismissal", () => {
    it("не считается отложенным, пока пользователь не закрыл попап", async () => {
      const { isCityPromptDismissed } = await import("@/lib/cities/client-city");
      expect(isCityPromptDismissed()).toBe(false);
    });

    it("после закрытия остаётся отложенным — это и есть предмет фикса", async () => {
      const { dismissCityPrompt, isCityPromptDismissed } = await import(
        "@/lib/cities/client-city"
      );
      const now = Date.UTC(2026, 8, 1);

      dismissCityPrompt(now);

      expect(isCityPromptDismissed(now)).toBe(true);
      expect(isCityPromptDismissed(now + 29 * 24 * 60 * 60 * 1000)).toBe(true);
    });

    it("отметка истекает — один крестик не лишает выбора города навсегда", async () => {
      const { dismissCityPrompt, isCityPromptDismissed, CITY_PROMPT_DISMISS_TTL_MS } =
        await import("@/lib/cities/client-city");
      const now = Date.UTC(2026, 8, 1);

      dismissCityPrompt(now);

      expect(isCityPromptDismissed(now + CITY_PROMPT_DISMISS_TTL_MS + 1)).toBe(false);
    });

    it("испорченное значение трактуется как «не откладывали», а не как вечное «да»", async () => {
      const { isCityPromptDismissed, CITY_PROMPT_DISMISSED_KEY } = await import(
        "@/lib/cities/client-city"
      );

      window.localStorage.setItem(CITY_PROMPT_DISMISSED_KEY, "не-число");

      expect(isCityPromptDismissed()).toBe(false);
    });

    it("выбор города и отказ — разные ключи: отказ не притворяется выбором", async () => {
      const { dismissCityPrompt, getCurrentCitySlug } = await import(
        "@/lib/cities/client-city"
      );

      dismissCityPrompt();

      // Город по-прежнему не выбран — SSR и каталог обязаны это видеть.
      expect(getCurrentCitySlug()).toBeNull();
    });
  });
});
