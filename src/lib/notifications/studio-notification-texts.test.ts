import { describe, expect, it } from "vitest";
import { STUDIO_NOTIFICATION_TEXTS as TX, type NotificationText } from "./studio-notification-texts";

/**
 * 29.09 доработки · 01-а — «Студия Студия Ольги» больше нигде: название в
 * «ёлочках» и называется командой; пустое название — без «»» и без
 * подставного «Студия»; пустое имя мастера — без «Мастер Мастер».
 *
 * Набор проверяемых функций — ВСЕ члены `STUDIO_NOTIFICATION_TEXTS`: новая
 * формулировка попадает под сторож фактом появления в модуле.
 *
 * @probe 2026-09-29 — в `inviteRevoked` возвращено «Студия ${name} отозвала
 * приглашение.»: покраснел «название студии не задваивается словом «студия»»
 * (получено «Студия Студия Ольги отозвала…»). Возвращено — зелёный.
 * @probe 2026-09-29 — в `inviteAccepted` имя без ёлочек (`${studioName}`):
 * покраснел «название — в ёлочках». Возвращено — зелёный.
 */

type AnyText = NotificationText & { subject?: string };

function renderAll(studioName: string, masterName: string): Array<[string, AnyText]> {
  return Object.entries(TX).map(([key, fn]) => {
    const call = fn as (...args: string[]) => AnyText;
    // Сигнатуры: (studio) · (studio, inviter) · (master, studio).
    const text =
      key === "inviteReceived"
        ? call(studioName, "Ольга")
        : call.length >= 2
          ? call(masterName, studioName)
          : call(studioName);
    return [key, text];
  });
}

function strings(text: AnyText): string[] {
  return [text.title, text.body, text.subject].filter((v): v is string => typeof v === "string");
}

describe("тексты уведомлений студии", () => {
  it("название студии не задваивается словом «студия»", () => {
    for (const [key, text] of renderAll("Студия Ольги", "Анна")) {
      for (const s of strings(text)) {
        expect(s, key).not.toMatch(/студи[а-яё]*\s+«?студи/i);
      }
    }
  });

  it("название — в ёлочках в каждом тексте, где оно есть", () => {
    for (const [key, text] of renderAll("Студия Ольги", "Анна")) {
      const all = strings(text).join(" | ");
      expect(all, key).toContain("«Студия Ольги»");
      expect(all.replace(/«Студия Ольги»/g, ""), key).not.toContain("Студия Ольги");
    }
  });

  it("пустое название — без пустых ёлочек и подставного «Студия» как имени", () => {
    for (const [key, text] of renderAll("  ", "Анна")) {
      for (const s of strings(text)) {
        expect(s, key).not.toContain("«»");
        expect(s, key).not.toMatch(/«\s*»/);
      }
    }
  });

  it("пустое имя мастера — без «Мастер Мастер»", () => {
    for (const [key, text] of renderAll("Студия Ольги", "")) {
      for (const s of strings(text)) {
        expect(s, key).not.toMatch(/мастер\s+мастер/i);
        expect(s, key).not.toMatch(/Мастер\s{2,}/);
      }
    }
  });

  it("приглашение: «Вас приглашают в команду «…»»", () => {
    expect(TX.inviteReceived("Студия Ольги", "Ольга").body).toBe(
      "Вас приглашают в команду «Студия Ольги». Приглашение отправил(а) Ольга.",
    );
    expect(TX.inviteRevoked("Студия Ольги").body).toBe("Команда «Студия Ольги» отозвала приглашение.");
  });
});
