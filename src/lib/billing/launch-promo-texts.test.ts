import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LAUNCH_PROMO_ENDS_AT } from "@/lib/billing/launch-promo";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * BETA-PROMO-DEC (2026-10-29) — тексты акции называют дату словами («до
 * 31 декабря», «с 1 января 2027 года»), а граница живёт константой
 * `LAUNCH_PROMO_ENDS_AT`. Тексты даты не форматируют (правило UI_FMT), поэтому
 * при переносе акции их надо править руками — и при прошлом переносе их было
 * одиннадцать в семи файлах. Сторож выводит обе даты из константы (по Москве —
 * пояс акции) и требует их в каждом тексте акции; прежняя граница в текстах
 * встречаться не должна.
 *
 * @probe 2026-10-29: `LAUNCH_PROMO_ENDS_AT` сдвинута на "2027-02-01T00:00:00+03:00"
 *   при неизменных текстах → красные 17 из 17 (каждый текст не содержит
 *   «31 января» / «1 февраля 2027»). Ответ в faq-content.tsx возвращён к «До
 *   1 ноября 2026 года PREMIUM у всех бесплатный.» при верной константе →
 *   красный ровно один кейс, «прежней границы нет … faq-content.tsx».
 */

const MSK = { timeZone: "Europe/Moscow" } as const;
const LAST_DAY = UI_FMT.date(new Date(LAUNCH_PROMO_ENDS_AT.getTime() - 1), "dayMonthLong", MSK);
const FIRST_DAY_AFTER = UI_FMT.date(LAUNCH_PROMO_ENDS_AT, "dayMonthLong", MSK);
const YEAR_AFTER = toLocalDateKey(LAUNCH_PROMO_ENDS_AT, MSK.timeZone).slice(0, 4);

function source(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("BETA-PROMO-DEC · тексты акции согласованы с её границей", () => {
  it("последний день акции по Москве — 31 декабря 2026", () => {
    expect(LAST_DAY).toBe("31 декабря");
    expect(FIRST_DAY_AFTER).toBe("1 января");
    expect(YEAR_AFTER).toBe("2027");
  });

  it.each([
    ["billing.launchPromo.title", UI_TEXT.billing.launchPromo.title],
    ["billing.launchPromo.planCta", UI_TEXT.billing.launchPromo.planCta],
    ["pricing.launchPromo.title", UI_TEXT.pricing.launchPromo.title],
    ["pricing.launchPromo.trialTitleItalic", UI_TEXT.pricing.launchPromo.trialTitleItalic],
    ["pricing.launchPromo.trialDescriptionMaster", UI_TEXT.pricing.launchPromo.trialDescriptionMaster],
    ["pricing.launchPromo.trialDescriptionStudio", UI_TEXT.pricing.launchPromo.trialDescriptionStudio],
    ["betaPromo.titleAccent", UI_TEXT.betaPromo.titleAccent],
  ])("последний день акции — в %s", (_key, text) => {
    expect(text).toContain(LAST_DAY);
  });

  it.each([
    ["billing.launchPromo.body", UI_TEXT.billing.launchPromo.body],
    ["pricing.launchPromo.description", UI_TEXT.pricing.launchPromo.description],
    ["pricing.launchPromo.trialDisclaimer", UI_TEXT.pricing.launchPromo.trialDisclaimer],
  ])("первый день после акции — в %s", (_key, text) => {
    expect(text).toContain(`${FIRST_DAY_AFTER} ${YEAR_AFTER}`);
  });

  it("ответ про пробный период на /pricing называет последний день акции", () => {
    const answer = UI_TEXT.pricing.faq.items.find((item) => item.id === "trial-activation")?.answer ?? "";
    expect(answer).toContain(LAST_DAY);
  });

  it.each([
    "src/features/faq/content/faq-content.tsx",
    "src/features/help/content/help-content.tsx",
    "src/app/api/billing/checkout/route.ts",
    "src/lib/ui/text/billing.ts",
    "src/lib/ui/text/pricing.ts",
  ])("прежней границы («1 ноября») нет, последний день акции есть — %s", (rel) => {
    const text = source(rel);
    expect(text).not.toContain("1 ноября");
    expect(text).toContain(LAST_DAY);
  });
});
