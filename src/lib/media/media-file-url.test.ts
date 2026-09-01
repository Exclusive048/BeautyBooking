import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "@/lib/testing/source-scan";
import { buildMediaFileUrl } from "@/lib/media/types";

/**
 * PWA-FIX-01 — форма ссылки на байты медиа-ассета.
 *
 * 🔴 Дефект, ради которого сторож существует. `client-cabinet/profile.service.ts`
 * собирал ссылку как `/api/media/<id>/file` — id В СЕРЕДИНЕ. Такого роута нет
 * (он лежит в `src/app/api/media/file/[id]`), поэтому аватар клиента отдавал
 * 404, а на экране оставался плейсхолдер `ResilientImage`: пользователь видел
 * «фото загрузилось и не показывается», сервер видел обычный 404 на неизвестный
 * путь. Не ловил НИ ОДИН существующий механизм — это валидный TypeScript,
 * валидный шаблонный литерал и валидный URL.
 *
 * Сторож проверяет ДВА свойства, и второе важнее первого:
 *   1. хелпер строит путь, который реально существует в дереве роутов
 *      (существование выводится из файловой системы, не из строки-копии);
 *   2. в `src/` нет ни одной ручной сборки перепутанной формы.
 *
 * @probe Проба выполнена на правдоподобной форме дефекта — не на выдуманной
 * строке в новом файле, а возвратом исходного литерала
 * (`/api/media/${avatarAsset.id}/file`) в `profile.service.ts`, откуда его и
 * убрали: сканер краснеет с «перепутанный порядок сегментов … profile.service.ts».
 * Отдельно проверено, что сканер НЕ вакуумен из-за очистки комментариев:
 * та же строка с хвостовым `// ...` тоже ловится (за это отвечает
 * `stripComments`, а не самодельная построчная регулярка).
 */

const SRC_ROOT = path.join(process.cwd(), "src");

/** Перепутанная форма: `${…}` между `media/` и `/file`. */
const SWAPPED_SEGMENTS = /\/api\/media\/\$\{[^}]+\}\/file/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("media file URL", () => {
  it("строит путь, под который в дереве есть роут", () => {
    expect(buildMediaFileUrl("abc123")).toBe("/api/media/file/abc123");

    // Существование роута выводится из ФС: копия строки здесь означала бы, что
    // сторож сверяет предположение с предположением.
    const routeFile = path.join(
      process.cwd(),
      "src",
      "app",
      "api",
      "media",
      "file",
      "[id]",
      "route.ts",
    );
    expect(existsSync(routeFile)).toBe(true);

    // И обратное: роута с id в середине нет — иначе перепутанная форма была бы
    // легитимной, и весь сторож терял бы смысл.
    const swappedRoute = path.join(process.cwd(), "src", "app", "api", "media", "[id]", "file");
    expect(existsSync(swappedRoute)).toBe(false);
  });

  it("нигде в src/ не собирается перепутанная форма /api/media/{id}/file", () => {
    const offenders: string[] = [];

    for (const file of walk(SRC_ROOT)) {
      if (file.endsWith("media-file-url.test.ts")) continue;
      const source = stripComments(readFileSync(file, "utf8"));
      if (SWAPPED_SEGMENTS.test(source)) {
        offenders.push(path.relative(process.cwd(), file).replace(/\\/g, "/"));
      }
    }

    expect(
      offenders,
      `перепутанный порядок сегментов (/api/media/{id}/file — роута с такой формой нет):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
