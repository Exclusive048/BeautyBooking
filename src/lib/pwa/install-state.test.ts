import { describe, expect, it } from "vitest";
import { detectPlatform, getPwaInstallServerSnapshot } from "@/lib/pwa/install-state";

/**
 * PWA-ONBOARDING-01 — инструкция по установке выбирается по устройству, и
 * ошибка тут дорогая именно на iPhone: там установка — только «Поделиться →
 * На экран „Домой“», и там же без установки не работают уведомления.
 */
describe("detectPlatform", () => {
  it("iPhone / iPad (старый UA)", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)")).toBe("ios");
  });

  it("iPadOS 13+ маскируется под Mac — выдаёт тач", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15";
    expect(detectPlatform(ua, 5, "MacIntel")).toBe("ios");
    expect(detectPlatform(ua, 0, "MacIntel")).toBe("desktop");
  });

  it("Android и десктоп", () => {
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0")).toBe("desktop");
  });

  it("на сервере модуль импортируется без window и отдаёт нейтральный снимок", () => {
    expect(getPwaInstallServerSnapshot()).toEqual({ installed: false, canPrompt: false, platform: "desktop" });
  });
});
