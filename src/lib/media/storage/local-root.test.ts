import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEC-23 — дефолтный корень локального хранилища лежал в `public/uploads`, то
 * есть Next раздавал бы вложения чата и фото клиентских карточек статикой по
 * `/uploads/...`, мимо `ensureCanReadMedia`.
 *
 * Тест проверяет именно РАСПОЛОЖЕНИЕ корня, а не запись файлов: доказательством
 * служит путь, который провайдер собирает из ключа.
 */

const mockEnv = vi.hoisted(() => ({
  MEDIA_LOCAL_ROOT: undefined as string | undefined,
  MEDIA_LOCAL_PUBLIC_URL: undefined as string | undefined,
}));

vi.mock("@/lib/env", () => ({ env: mockEnv }));

const writeFile = vi.hoisted(() => vi.fn());
const mkdir = vi.hoisted(() => vi.fn());

vi.mock("fs/promises", () => ({
  writeFile,
  mkdir,
  rm: vi.fn(),
  stat: vi.fn(),
}));
vi.mock("fs", () => ({ createReadStream: vi.fn() }));

async function loadProvider() {
  vi.resetModules();
  const mod = await import("@/lib/media/storage/local");
  return new mod.LocalStorageProvider();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.MEDIA_LOCAL_ROOT = undefined;
});

afterEach(() => {
  vi.resetModules();
});

describe("LocalStorageProvider — корень по умолчанию (SEC-23)", () => {
  it("пишет ВНЕ `public/` — иначе файл раздаётся статикой мимо ACL", async () => {
    const provider = await loadProvider();
    await provider.putObject({ key: "chat/abc.jpg", bytes: new Uint8Array([1]), contentType: "image/jpeg" });

    const written = String(writeFile.mock.calls[0][0]).replace(/\\/g, "/");
    expect(written).not.toContain("/public/");
    expect(written).toContain("/.media-uploads/");
  });

  it("явный `MEDIA_LOCAL_ROOT` по-прежнему уважается", async () => {
    mockEnv.MEDIA_LOCAL_ROOT = "/tmp/custom-media";
    const provider = await loadProvider();
    await provider.putObject({ key: "chat/abc.jpg", bytes: new Uint8Array([1]), contentType: "image/jpeg" });

    const written = String(writeFile.mock.calls[0][0]).replace(/\\/g, "/");
    expect(written).toContain("/tmp/custom-media/");
  });

  it("обход каталога по-прежнему не проходит", async () => {
    const provider = await loadProvider();
    await provider.putObject({
      key: "../../etc/passwd",
      bytes: new Uint8Array([1]),
      contentType: "image/jpeg",
    });

    // `..`-сегменты выбрасываются, поэтому путь остаётся ВНУТРИ корня:
    // получается `<root>/etc/passwd`, а не `/etc/passwd`.
    const written = String(writeFile.mock.calls[0][0]).replace(/\\/g, "/");
    const rootIndex = written.indexOf("/.media-uploads/");
    expect(rootIndex).toBeGreaterThanOrEqual(0);
    expect(written.slice(rootIndex)).toBe("/.media-uploads/etc/passwd");
  });
});
