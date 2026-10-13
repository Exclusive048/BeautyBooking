import { describe, expect, it } from "vitest";
import {
  PROVIDER_DESCRIPTION_MAX,
  buildProviderDescription,
  buildProviderTitle,
  providerSpecialty,
  truncateAtWord,
} from "./provider-meta";

/**
 * SEO-02: заголовок и описание страницы мастера/студии.
 *
 * @probe 2026-10-12 — в `buildProviderDescription` убрано схлопывание пробелов
 *   (`collapse` → `trim`): красный «переводы строк из «о себе» не попадают в
 *   описание» (в описании остался `\n`). Убрана проверка `seen` — красный
 *   «одноимённые услуги не повторяются». Возвращено — зелёные.
 */

const service = (name: string, categoryTitle: string | null = null) => ({ name, categoryTitle });

describe("buildProviderTitle", () => {
  it("мастер: имя, самая частая категория строчной буквой и город", () => {
    expect(
      buildProviderTitle({
        name: "Анита Дмитриева",
        type: "MASTER",
        cityName: "Липецк",
        services: [service("Вечерний", "Макияж"), service("Брови", "Оформление бровей"), service("Свадебный", "Макияж")],
      }),
    ).toBe("Анита Дмитриева — макияж, Липецк");
  });

  it("без города — без запятой в конце", () => {
    expect(
      buildProviderTitle({ name: "Manikkkot", type: "MASTER", cityName: null, services: [service("Маникюр", "Маникюр")] }),
    ).toBe("Manikkkot — маникюр");
  });

  it("без категорий у мастера — «мастер красоты», у студии — всегда «студия красоты»", () => {
    expect(buildProviderTitle({ name: "Артем", type: "MASTER", cityName: "Липецк", services: [service("Аппаратный")] })).toBe(
      "Артем — мастер красоты, Липецк",
    );
    expect(
      buildProviderTitle({ name: "ПО ЛЮБВИ", type: "STUDIO", cityName: "Липецк", services: [service("Маникюр", "Маникюр")] }),
    ).toBe("ПО ЛЮБВИ — студия красоты, Липецк");
  });

  it("пустое имя не даёт заголовка, начинающегося с тире", () => {
    expect(buildProviderTitle({ name: "  ", type: "MASTER", cityName: null, services: [] })).toBe("Мастер");
    expect(buildProviderTitle({ name: "  ", type: "STUDIO", cityName: "Липецк", services: [] })).toBe("Студия, Липецк");
  });

  it("дело уже названо в имени — без повтора: имя и город", () => {
    expect(buildProviderTitle({ name: "Студия «Аура»", type: "STUDIO", cityName: "Москва", services: [] })).toBe(
      "Студия «Аура», Москва",
    );
    expect(
      buildProviderTitle({ name: "Маникюр у Ани", type: "MASTER", cityName: null, services: [service("Маникюр", "Маникюр")] }),
    ).toBe("Маникюр у Ани");
  });

  it("аббревиатура в начале категории не становится строчной", () => {
    expect(providerSpecialty({ type: "MASTER", services: [service("Уход", "SPA-уход")] })).toBe("SPA-уход");
  });
});

describe("buildProviderDescription", () => {
  it("переводы строк из «о себе» не попадают в описание", () => {
    const description = buildProviderDescription({
      name: "Студия",
      type: "STUDIO",
      cityName: null,
      description: "Мы рады приветствовать вас\nна странице студии\n\nпо Любви 💖",
      services: [],
    });
    expect(description).toBe("Мы рады приветствовать вас на странице студии по Любви 💖");
  });

  it("длинное «о себе» обрезается по границе слова", () => {
    const description = buildProviderDescription({
      name: "Мастер",
      type: "MASTER",
      cityName: null,
      description: "слово ".repeat(60),
      services: [],
    });
    expect(description.length).toBeLessThanOrEqual(PROVIDER_DESCRIPTION_MAX);
    expect(description.endsWith("слово…")).toBe(true);
  });

  it("одноимённые услуги не повторяются", () => {
    const description = buildProviderDescription({
      name: "Viktoria Teller",
      type: "MASTER",
      cityName: null,
      description: null,
      services: [service("Прическа для бальных танцев"), service("Прическа  для бальных танцев")],
    });
    expect(description.match(/Прическа для бальных танцев/g)).toHaveLength(1);
    expect(description).toContain("МастерРядом");
  });
});

describe("truncateAtWord", () => {
  it("короткий текст не трогает", () => {
    expect(truncateAtWord("Коротко.", 160)).toBe("Коротко.");
  });

  it("не оставляет запятую перед многоточием", () => {
    expect(truncateAtWord("один, два, три, четыре", 12)).toBe("один, два…");
  });
});
