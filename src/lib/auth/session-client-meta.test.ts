import { describe, expect, it } from "vitest";

import {
  readMobileSessionIssueMeta,
  readSessionDeviceMeta,
  readWebSessionIssueMeta,
  SESSION_META_MAX_LENGTH,
} from "@/lib/auth/session-client-meta";

/**
 * MOBILE-AUTH-A — метаданные устройства приходят от клиента, то есть верить
 * можно только форме: значение проходит проверку формата/длины или становится
 * `null`; свободный текст чистится и обрезается до длины `VARCHAR` колонки.
 */

function meta(headers: Record<string, string>) {
  return readSessionDeviceMeta(new Headers(headers));
}

describe("readSessionDeviceMeta", () => {
  it("штатные заголовки приложения проходят как есть", () => {
    expect(
      meta({
        "x-client-platform": "iOS",
        "x-app-version": "1.0.0+12",
        "x-device-name": "iPhone 15",
        "x-installation-id": "6f1c2c1e-1111-4a2b-9c3d-000000000001",
        "user-agent": "MasterRyadom/1.0.0 (iOS 18.1; iPhone15,2)",
      }),
    ).toEqual({
      platform: "ios",
      appVersion: "1.0.0+12",
      deviceName: "iPhone 15",
      installationId: "6f1c2c1e-1111-4a2b-9c3d-000000000001",
      userAgent: "MasterRyadom/1.0.0 (iOS 18.1; iPhone15,2)",
    });
  });

  it("нет заголовков — все поля null", () => {
    expect(meta({})).toEqual({
      platform: null,
      appVersion: null,
      deviceName: null,
      installationId: null,
      userAgent: null,
    });
  });

  it("неизвестная платформа и мусорная версия/установка отвергаются, а не обрезаются", () => {
    const result = meta({
      "x-client-platform": "windows-phone",
      "x-app-version": "1.0 beta; drop table",
      "x-installation-id": "short",
    });
    expect(result.platform).toBeNull();
    expect(result.appVersion).toBeNull();
    expect(result.installationId).toBeNull();
    expect(meta({ "x-app-version": "1".repeat(SESSION_META_MAX_LENGTH.appVersion + 1) }).appVersion).toBeNull();
    expect(meta({ "x-installation-id": "a".repeat(65) }).installationId).toBeNull();
  });

  it("имя устройства: percent-encoded UTF-8 декодируется, битая последовательность — как есть", () => {
    // Значение заголовка — ByteString: кириллицу клиент обязан кодировать.
    expect(meta({ "x-device-name": encodeURIComponent("iPhone Анны") }).deviceName).toBe("iPhone Анны");
    expect(meta({ "x-device-name": "100%25 battery" }).deviceName).toBe("100% battery");
    expect(meta({ "x-device-name": "50% off" }).deviceName).toBe("50% off");
  });

  it("свободный текст: управляющие символы вычищены, длина — по кодовым точкам", () => {
    // Таб разрешён в значении заголовка и обязан схлопнуться в пробел;
    // управляющий символ доезжает только через percent-encoding.
    expect(meta({ "x-device-name": "  My\t\tphone  " }).deviceName).toBe("My phone");
    expect(meta({ "x-device-name": "My%00%1Bphone" }).deviceName).toBe("My phone");

    const emoji = encodeURIComponent("📱".repeat(SESSION_META_MAX_LENGTH.deviceName + 10));
    const name = meta({ "x-device-name": emoji }).deviceName!;
    expect(Array.from(name)).toHaveLength(SESSION_META_MAX_LENGTH.deviceName);
    // Обрезка не разрывает суррогатную пару.
    expect(name.endsWith("📱")).toBe(true);

    const ua = meta({ "user-agent": "x".repeat(2000) }).userAgent!;
    expect(ua).toHaveLength(SESSION_META_MAX_LENGTH.userAgent);
  });

  it("выдача мобильной сессии помечает клиента MOBILE", () => {
    expect(readMobileSessionIssueMeta(new Headers({ "x-client-platform": "android" }))).toMatchObject({
      clientType: "MOBILE",
      platform: "android",
    });
  });
});

describe("readWebSessionIssueMeta (MOBILE-AUTH-A3)", () => {
  it("веб-сессия несёт только User-Agent; заголовки X-* браузера не читаются", () => {
    expect(
      readWebSessionIssueMeta(
        new Headers({
          "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0",
          "x-client-platform": "android",
          "x-device-name": "Forged",
        }),
      ),
    ).toEqual({ clientType: "WEB", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0" });
  });

  it("нет User-Agent — нет меты (строка сессии прежней формы)", () => {
    expect(readWebSessionIssueMeta(new Headers())).toBeUndefined();
    expect(readWebSessionIssueMeta(new Headers({ "user-agent": "  " }))).toBeUndefined();
  });
});
