import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * LOGIC-19 — `TimeBlock.masterId` был голой строкой без `@relation`. Следствий
 * два, и оба тихие:
 *
 *  1. БД про связь не знала, поэтому блок, чей мастер удалён, оставался
 *     «сиротой» навсегда — и продолжал участвовать в `loadTimeBlockRanges`,
 *     который ищет именно по `masterId`;
 *  2. DMMF-guard инварианта #38 связь не видел вовсе: он обходит РЕЛЯЦИИ, а
 *     скалярное поле ею не является. То есть механизм, созданный ровно против
 *     «списка, который молча протух», на эту связь не распространялся.
 *
 * Тест читает DMMF, а не исходник схемы: важно, что связь существует в модели
 * данных, а не что в файле есть нужная строка.
 */

const timeBlock = Prisma.dmmf.datamodel.models.find((model) => model.name === "TimeBlock");
const provider = Prisma.dmmf.datamodel.models.find((model) => model.name === "Provider");

describe("TimeBlock.masterId — внешний ключ (LOGIC-19)", () => {
  it("связь объявлена и ссылается на Provider по masterId", () => {
    const relation = timeBlock?.fields.find(
      (field) => field.kind === "object" && field.relationFromFields?.includes("masterId")
    );
    expect(relation, "TimeBlock не имеет relation-поля на masterId").toBeDefined();
    expect(relation!.type).toBe("Provider");
    expect(relation!.relationToFields).toEqual(["id"]);
  });

  it("удаление строки Provider уносит блоки (backstop на уровне БД)", () => {
    const relation = timeBlock?.fields.find(
      (field) => field.kind === "object" && field.relationFromFields?.includes("masterId")
    );
    expect(relation!.relationOnDelete).toBe("Cascade");
  });

  it("обратная сторона видна на Provider — иначе DMMF-guard инв. #38 её не заметит", () => {
    const back = provider?.fields.find(
      (field) => field.kind === "object" && field.type === "TimeBlock"
    );
    expect(back, "у Provider нет обратной связи на TimeBlock").toBeDefined();
    expect(back!.isList).toBe(true);
  });

  it("удаление кабинета чистит блоки ЯВНО — каскад тут не сработает", async () => {
    // Строка Provider переживает удаление кабинета (анонимизируется), поэтому
    // объявленный Cascade не срабатывает НИКОГДА — ровно та ловушка, ради
    // которой существует карта диспозиций.
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/deletion/delete-master.ts"),
      "utf8"
    );
    expect(source).toMatch(/tx\.timeBlock\.deleteMany\(\{\s*where:\s*\{\s*masterId:\s*providerId/);
  });
});
