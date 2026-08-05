import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

import { AppError } from "@/lib/api/errors";
import { MEDIA_MAX_FILE_SIZE_BYTES } from "@/lib/media/types";
import { readValidatedImageUpload } from "@/lib/media/validate-image-upload";

/**
 * SEC-06 — доверять можно магическим байтам, а не `File.type`.
 *
 * Оба роута фото клиентской карточки клали в хранилище сырые байты с
 * `mimeType: fileValue.type` — строкой от клиента. Тест проверяет именно то
 * свойство, которого не было: заявление клиента ни на что не влияет, а
 * содержимое, не являющееся картинкой, не сохраняется вообще.
 */

async function realPng(width = 8, height = 8): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 90 } },
  })
    .png()
    .toBuffer();
}

async function realJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .jpeg()
    .toBuffer();
}

function asFile(bytes: Buffer, claimedType: string, name = "photo.png"): File {
  return new File([new Uint8Array(bytes)], name, { type: claimedType });
}

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
  }
  throw new Error("ожидалась ошибка, но вызов прошёл успешно");
}

describe("SEC-06 · заявленный клиентом MIME не принимается на веру", () => {
  it("HTML под видом image/png отвергается", async () => {
    const html = Buffer.from("<html><script>alert(1)</script></html>", "utf8");
    const error = await expectAppError(
      readValidatedImageUpload(asFile(html, "image/png"), { quality: 90 }),
    );
    expect(error.code).toBe("MEDIA_INVALID_MIME");
    expect(error.status).toBe(415);
  });

  it("SVG отвергается — его нет в allowlist, а это активный контент", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      "utf8",
    );
    const error = await expectAppError(
      readValidatedImageUpload(asFile(svg, "image/png", "x.svg"), { quality: 90 }),
    );
    expect(error.code).toBe("MEDIA_INVALID_MIME");
  });

  // Регрессия, найденная этим же тестом: `fileTypeFromBuffer` на обрезанном
  // заголовке БРОСАЕТ EndOfStreamError, а не возвращает undefined. В трёх
  // инлайн-копиях это давало 500 вместо 415.
  it("обрезанный ZIP-заголовок под видом image/jpeg даёт 415, а не 500", async () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00]);
    const error = await expectAppError(
      readValidatedImageUpload(asFile(zip, "image/jpeg", "x.jpg"), { quality: 90 }),
    );
    expect(error.code).toBe("MEDIA_INVALID_MIME");
    expect(error.status).toBe(415);
  });

  it("битая картинка с валидным PNG-заголовком даёт 415, а не 500", async () => {
    const header = (await realPng()).subarray(0, 40);
    const corrupt = Buffer.concat([header, Buffer.alloc(64, 0xff)]);
    const error = await expectAppError(
      readValidatedImageUpload(asFile(corrupt, "image/png"), { quality: 90 }),
    );
    expect(error.code).toBe("MEDIA_INVALID_MIME");
    expect(error.status).toBe(415);
  });

  it("настоящий PNG принимается, а тип берётся из БАЙТОВ, не из заявления", async () => {
    const png = await realPng();
    const result = await readValidatedImageUpload(
      // клиент врёт про тип — на результат это не влияет
      asFile(png, "application/octet-stream"),
      { quality: 90 },
    );
    expect(result.mimeType).toBe("image/webp");
    expect(result.sizeBytes).toBe(result.bytes.byteLength);
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it("настоящий JPEG остаётся JPEG", async () => {
    const result = await readValidatedImageUpload(asFile(await realJpeg(), "image/png"), {
      quality: 90,
    });
    expect(result.mimeType).toBe("image/jpeg");
  });
});

describe("SEC-06 · переупаковка убивает полиглот", () => {
  it("нагрузка, дописанная в хвост валидного PNG, не доезжает до хранилища", async () => {
    const payload = "<script>alert('xss')</script>";
    const polyglot = Buffer.concat([await realPng(), Buffer.from(payload, "utf8")]);

    // Сам полиглот определяется как PNG — sniff'а одного было бы мало.
    const result = await readValidatedImageUpload(asFile(polyglot, "image/png"), {
      quality: 90,
    });

    const stored = Buffer.from(result.bytes).toString("latin1");
    expect(stored).not.toContain(payload);
    expect(stored).not.toContain("<script>");
  });
});

/**
 * Тесты выше проверяют примитив. Этот блок проверяет, что роуты им ПОЛЬЗУЮТСЯ:
 * иначе примитив может остаться зелёным, пока роут снова кладёт сырые байты.
 * Форма проверки — source-level, как в `client-privacy.test.ts`: строковое
 * сравнение срабатывает даже там, где обход типизируется корректно.
 */
describe("SEC-06 · загрузочные роуты не обходят примитив", () => {
  const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
  const UPLOAD_ROUTES = [
    "src/app/api/master/clients/[clientKey]/card/photos/route.ts",
    "src/app/api/studio/clients/[clientKey]/card/photos/route.ts",
  ] as const;

  for (const rel of UPLOAD_ROUTES) {
    it(`${rel} читает файл через readValidatedImageUpload`, () => {
      const source = readFileSync(resolve(PROJECT_ROOT, rel), "utf8");
      expect(source).toContain("readValidatedImageUpload");
      // Заявленный клиентом тип и сырой размер не должны доезжать до хранилища.
      expect(source).not.toContain("mimeType: fileValue.type");
      expect(source).not.toContain("sizeBytes: fileValue.size");
    });
  }
});

describe("SEC-06 · границы размера", () => {
  it("пустой файл отвергается", async () => {
    const error = await expectAppError(
      readValidatedImageUpload(asFile(Buffer.alloc(0), "image/png"), { quality: 90 }),
    );
    expect(error.code).toBe("MEDIA_FILE_TOO_LARGE");
    expect(error.status).toBe(413);
  });

  it("файл больше лимита отвергается ДО чтения буфера", async () => {
    const oversized = {
      size: MEDIA_MAX_FILE_SIZE_BYTES + 1,
      name: "big.png",
      type: "image/png",
      arrayBuffer: () => {
        throw new Error("буфер не должен читаться для файла сверх лимита");
      },
    } as unknown as File;

    const error = await expectAppError(readValidatedImageUpload(oversized, { quality: 90 }));
    expect(error.code).toBe("MEDIA_FILE_TOO_LARGE");
  });
});
