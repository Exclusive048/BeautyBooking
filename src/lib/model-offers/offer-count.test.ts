import { describe, expect, it } from "vitest";

import { formatModelOfferCount } from "./offer-count";

// Правило склонения одно на `/models` и карточку «Для моделей» в футере
// (29.09 доработки · 18: футер форматирует на сервере, клиентский FooterCTA
// получает готовую строку).
describe("formatModelOfferCount", () => {
  it.each([
    [1, "1 предложение"],
    [2, "2 предложения"],
    [4, "4 предложения"],
    [5, "5 предложений"],
    [11, "11 предложений"],
    [12, "12 предложений"],
    [14, "14 предложений"],
    [21, "21 предложение"],
    [22, "22 предложения"],
    [111, "111 предложений"],
    [0, "0 предложений"],
  ])("%i → %s", (count, expected) => {
    expect(formatModelOfferCount(count)).toBe(expected);
  });
});
