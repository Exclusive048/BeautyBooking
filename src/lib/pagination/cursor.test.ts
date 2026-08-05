import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { encodeCursor, decodeCursor } from "@/lib/pagination/cursor";
import { encodePublicId, decodePublicId } from "@/lib/public-id";

/**
 * SEC-12 — сырые CUID не уходят в публичные ответы и в курсоры пагинации.
 *
 * Правильная форма курсора в проекте существовала, но была приватной функцией
 * внутри `catalog.service.ts`, поэтому соседние списки отдавали курсором сырой
 * `id`. Аудит отметил это отдельно: задокументированное исключение rule 12 для
 * `/api/providers/[id]` на **курсор** не распространяется.
 *
 * Тест держит три вещи: сам примитив, обратную совместимость декодера (старые
 * ссылки с сырым CUID обязаны продолжать работать) и source-level запрет на
 * возврат сырых id из исправленных публичных поверхностей — иначе примитив
 * останется зелёным, пока роут снова кладёт `id: x.id`.
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const CUID = "cm5qz1a0b0000v3l8h2k9d1x7";

function readSource(rel: string): string {
  return readFileSync(resolve(PROJECT_ROOT, rel), "utf8");
}

describe("SEC-12 · курсор", () => {
  it("round-trip возвращает исходный id", () => {
    expect(decodeCursor(encodeCursor(CUID))).toBe(CUID);
  });

  it("закодированный курсор не содержит исходный id", () => {
    expect(encodeCursor(CUID)).not.toContain(CUID);
  });

  it("токен URL-safe — не требует экранирования в query", () => {
    const token = encodeCursor(`${CUID}:${CUID}:2026-08-05T10:00:00.000Z`);
    expect(token).toBe(encodeURIComponent(token));
  });

  it("мусорный курсор декодируется в null, а не бросает", () => {
    expect(decodeCursor("")).toBeNull();
  });
});

describe("SEC-12 · публичный id категории переживает round-trip через URL", () => {
  it("encode → decode возвращает исходный CUID", () => {
    expect(decodePublicId(encodePublicId(CUID))).toBe(CUID);
  });

  it("старая ссылка с сырым CUID продолжает работать", () => {
    // Закладки и расшаренные ссылки на каталог несут сырой id — фикс не имеет
    // права их сломать.
    expect(decodePublicId(CUID)).toBe(CUID);
  });
});

describe("SEC-12 · публичные поверхности не отдают сырые id", () => {
  it("автокомплит: категория кодируется, у провайдера id убран совсем", () => {
    const source = readSource("src/app/api/catalog/autocomplete/route.ts");
    expect(source).toContain("encodePublicId(c.id)");
    // У провайдера рядом есть publicUsername, а потребителя у id нет.
    expect(source).not.toContain("id: p.id");
  });

  it("global-categories: id кодируется", () => {
    const source = readSource("src/app/api/catalog/global-categories/route.ts");
    expect(source).toContain("encodePublicId(category.id)");
    expect(source).not.toContain("id: category.id,");
  });

  it("каталог декодирует globalCategoryId на входе", () => {
    const source = readSource("src/lib/catalog/catalog.service.ts");
    expect(source).toContain("decodePublicId(globalCategoryId.trim())");
  });

  it("список провайдеров отдаёт курсором токен, а не сырой id", () => {
    const source = readSource("src/lib/providers/queries.ts");
    expect(source).toContain("encodeCursor(lastId)");
    expect(source).not.toMatch(/nextCursor\s*=\s*hasMore\s*\?\s*pageItems/);
  });

  it("hot-slots не отдаёт склейку из двух CUID как публичный id", () => {
    const source = readSource("src/app/api/hot-slots/route.ts");
    expect(source).toContain("id: encodeCursor(internalKey)");
    expect(source).not.toContain("items.push({\n            id,");
  });
});
