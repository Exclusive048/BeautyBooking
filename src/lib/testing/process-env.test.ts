import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isOsEnvKey, resetProcessEnv } from "@/lib/testing/process-env";

/**
 * Сброс окружения в тестах env-модуля сохраняет переменные ОС (см. шапку
 * `process-env.ts`: без `SystemRoot` OpenSSL 3.5 на Windows не выдаёт случайные
 * байты, и `randomUUID()` в обработчике роута падает).
 *
 * @probe Вернуть в `vk-client-id-alias.test.ts` полный сброс
 * `for (const key of Object.keys(process.env)) delete process.env[key];` —
 * сторож «полный сброс окружения запрещён» краснеет с именем файла. На
 * Windows + Node 26 тот же файл без хелпера падал «entropy source strength too
 * weak» в тесте стартовой ноги VK.
 */

const originalEnv = { ...process.env };

afterEach(() => {
  resetProcessEnv(originalEnv);
});

describe("resetProcessEnv", () => {
  it("убирает переменные приложения и ставит набор кейса", () => {
    process.env.MR_PROCESS_ENV_PROBE = "stale";
    resetProcessEnv({ MR_PROCESS_ENV_NEXT: "fresh", MR_PROCESS_ENV_GONE: undefined });

    expect(process.env.MR_PROCESS_ENV_PROBE).toBeUndefined();
    expect(process.env.MR_PROCESS_ENV_NEXT).toBe("fresh");
    expect("MR_PROCESS_ENV_GONE" in process.env).toBe(false);
  });

  it("оставляет переменные ОС, которые были у процесса", () => {
    const osKeysBefore = Object.keys(originalEnv).filter(isOsEnvKey);
    expect(osKeysBefore.length).toBeGreaterThan(0);

    resetProcessEnv({});

    for (const key of osKeysBefore) {
      expect(process.env[key], key).toBe(originalEnv[key]);
    }
  });

  it("регистр имени переменной ОС не важен (Windows: Path / PATH)", () => {
    expect(isOsEnvKey("Path")).toBe(true);
    expect(isOsEnvKey("PATH")).toBe(true);
    expect(isOsEnvKey("systemroot")).toBe(true);
    expect(isOsEnvKey("DATABASE_URL")).toBe(false);
  });
});

const SRC_ROOT = path.resolve(__dirname, "..", "..");
const FULL_WIPE = /for\s*\(\s*const\s+(\w+)\s+of\s+Object\.keys\(\s*process\.env\s*\)\s*\)\s*\{?\s*delete\s+process\.env\[\s*\1\s*\]/;

function listTestFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules") continue;
      listTestFiles(full, out);
    } else if (/\.(ts|tsx|mts)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("полный сброс process.env в тестах запрещён", () => {
  it("ни один файл src/ не удаляет все переменные окружения подряд", () => {
    const offenders = listTestFiles(SRC_ROOT)
      .filter((file) => path.resolve(file) !== path.resolve(__filename))
      .filter((file) => FULL_WIPE.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(SRC_ROOT, file).replace(/\\/g, "/"));
    expect(offenders, "используйте resetProcessEnv из @/lib/testing/process-env").toEqual([]);
  });
});
