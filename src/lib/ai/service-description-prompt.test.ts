import { describe, expect, it } from "vitest";
import { AI_PROMPTS } from "./prompts";

/**
 * 29.09 доработки · 00-14 — цена услуги хранится в копейках; в промпт уходила
 * как есть, подписанная рублями (1 500 ₽ → «150000₽»).
 */
describe("AI_PROMPTS.serviceDescription", () => {
  it("цена из копеек переводится в рубли", () => {
    const prompt = AI_PROMPTS.serviceDescription.buildUserPrompt({
      name: "Маникюр",
      category: "Ногти",
      priceKopeks: 150_000,
      durationMin: 90,
    });
    expect(prompt).toContain("Цена: 1500₽");
    expect(prompt).not.toContain("150000");
  });
});
