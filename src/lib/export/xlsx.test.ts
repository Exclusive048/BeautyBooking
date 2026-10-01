import { inflateRawSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildXlsx, columnName, crc32 } from "@/lib/export/xlsx";

/**
 * ADMIN-EVENTS-EXPORT — писатель .xlsx без зависимостей. Файл проверен
 * openpyxl (строгий читатель OOXML) при постройке; здесь — то, что ломает
 * открытие: CRC, имена колонок, экранирование, разбор ZIP.
 *
 * @probe 2026-10-01 — убрать экранирование «&» в escapeXml → красный
 *        «спецсимволы экранированы».
 */

/** Разбор ZIP по центральному каталогу — как это делает Excel. */
function unzip(buf: Buffer): Record<string, string> {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let ptr = buf.readUInt32LE(end + 16);
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i += 1) {
    expect(buf.readUInt32LE(ptr)).toBe(0x02014b50);
    const crc = buf.readUInt32LE(ptr + 16);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const dataStart = localOffset + 30 + localNameLen;
    const raw = inflateRawSync(buf.subarray(dataStart, dataStart + compSize));
    expect(crc32(raw), name).toBe(crc);
    out[name] = raw.toString("utf8");
    ptr += 46 + nameLen;
  }
  return out;
}

describe("buildXlsx", () => {
  it("CRC-32 совпадает с эталоном", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("имена колонок", () => {
    expect([0, 25, 26, 27, 701].map(columnName)).toEqual(["A", "Z", "AA", "AB", "ZZ"]);
  });

  it("книга разбирается, заголовок жирный, числа — числами, спецсимволы экранированы", () => {
    const files = unzip(
      buildXlsx({
        name: "События",
        columns: [{ header: "Время" }, { header: "Тип" }, { header: "Сумма" }],
        rows: [["01.10.2026, 14:30", "Запись & <тест>", 3500], ["x", null, "−2 200 ₽"]],
      }),
    );
    expect(Object.keys(files).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    const sheet = files["xl/worksheets/sheet1.xml"]!;
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1">');
    expect(sheet).toContain('<c r="C2"><v>3500</v></c>');
    expect(sheet).toContain("Запись &amp; &lt;тест&gt;");
    expect(sheet).not.toContain('r="B3"');
    expect(sheet).toContain('<autoFilter ref="A1:C3"/>');
    expect(files["xl/workbook.xml"]).toContain('name="События"');
  });
});
