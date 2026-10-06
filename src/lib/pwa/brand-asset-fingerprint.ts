import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Отпечаток набора иконок — значение `BRAND_ASSET_VERSION`
 * (`brand-asset-version.ts`, BRAND-ICONS-CACHE-01). Считают генератор
 * (`npm run generate:icons` пишет его в адреса) и сторож
 * `brand-asset-version.test.ts` (сверяет с файлами). Только Node — в браузер
 * не импортировать.
 */

/** Каталоги `public/`, чьи файлы входят в отпечаток. */
export const BRAND_ASSET_DIRS = ["brand", "splash"] as const;

/** Манифест сам несёт версию в адресах: в отпечатке он зависел бы от себя. */
const EXCLUDED = new Set(["brand/manifest.webmanifest"]);

// Рабочая копия на Windows — CRLF, в git и на проде — LF: текст хэшируется без `\r`.
const TEXT_FILE = /\.(?:svg|webmanifest|json)$/i;

export function computeBrandAssetFingerprint(publicDir: string): string {
  const hash = createHash("sha256");
  for (const dir of BRAND_ASSET_DIRS) {
    const entries = readdirSync(path.join(publicDir, dir), { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
    for (const name of entries) {
      const relative = `${dir}/${name}`;
      if (EXCLUDED.has(relative)) continue;
      const raw = readFileSync(path.join(publicDir, dir, name));
      const bytes = TEXT_FILE.test(name) ? Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8") : raw;
      hash.update(relative).update("\0").update(bytes).update("\0");
    }
  }
  return hash.digest("hex").slice(0, 10);
}
