import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { ROOT } from "@/lib/testing/client-graph";
import { readTextKeyAccessFromSource, TEXT_BARREL, TEXT_DIR, type TextKeyAccess } from "@/lib/testing/text-domains";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * UI-TEXT-DEAD-KEY-SWEEP — у каждого ключа `UI_TEXT` есть читатель.
 *
 * `check:ui-text` смотрит в одну сторону — русская строка мимо `UI_TEXT`.
 * Обратную — ключ, который больше никто не читает, — не видел никто, и к
 * 2026-10-10 таких набралось 1626 из 6574 (четверть): три домена целиком
 * (`cabinetHub`, `analytics`, `services`), поддерево `cabinet.master`, старый
 * кабинет мастера внутри `master.*`, прежние формы студии (`studioCabinet.
 * services`, `.profile`, `.calendar`). Мёртвый ключ создаёт ложное впечатление,
 * что поверхность живая, и его правят вместо живого соседа (`phonePlaceholder`
 * при живом `phonePlaceholderMask`).
 *
 * Читатели — все модули `src/`, `scripts/`, `prisma/` кроме самих доменов и
 * этого файла; тесты — тоже читатели (`pages.maintenance` держит зеркало
 * статической страницы «идут работы», и читает его только тест). Обращения
 * разбирает компилятор (`readTextKeyAccessFromSource`): псевдонимы и
 * деструктуризация прослеживаются, а поддерево, ушедшее значением (индекс,
 * проп, аргумент, `Object.keys`, экспорт, `keyof typeof`), считается
 * прочитанным целиком. Ошибается сторож поэтому только в одну сторону: может
 * не заметить мёртвый ключ, но живой мёртвым не объявит.
 *
 * Слепые формы: псевдоним, экспортированный и прочитанный в другом модуле
 * (поддерево «целиком»), и поддерево, отданное компоненту пропом, — ключи
 * внутри них сторож не судит.
 *
 * @probe 2026-10-10 — каждая проба меняет одну ось, наблюдалось:
 *   (1) в `guest-manage.ts` добавлен ключ `probeUnused: "Проба"` без
 *       читателя: красный «у каждого ключа есть читатель»,
 *       `expected [ 'guestManage.probeUnused' ] to deeply equal []`.
 *   (2) в `guest-manage-link-card.tsx` единственное чтение `T.copied`
 *       (псевдоним `const T = UI_TEXT.guestManage`) заменено литералом:
 *       красные оба — `guestManage.copied` без читателя, якорь не-вакуумности
 *       «разбор находит читателей» тоже.
 *   (3) правдоподобная форма: там же чтение осталось только в комментарии
 *       (`"" /* T.copied *\/`) — красные оба, как (2): упоминание в
 *       комментарии читателем не считается.
 *   (4) контроль для обратных проб: в `studio-booking.ts` единственное чтение
 *       `TS.mastersLoadFailed` (псевдоним `const TS = UI_TEXT.publicStudio`)
 *       заменено соседним ключом — красный с `publicStudio.mastersLoadFailed`.
 *   (5) обратная к (4): то же чтение как `TS[("mastersLoadFailed" as const)]`
 *       — зелёный, индекс держит всё поддерево `publicStudio`.
 *   (6) обратная к (4): `const { mastersLoadFailed } = UI_TEXT.publicStudio`
 *       и чтение через деструктурированное имя — зелёный.
 *   Возвращено — 2/2 зелёные.
 */

const SELF = join(ROOT, "src", "lib", "ui", "text-dead-keys.test.ts");
const SCAN_DIRS = ["src", "scripts", "prisma"];
const SKIP_DIRS = new Set(["node_modules", ".next", "generated"]);
const SOURCE_FILE = /\.(?:tsx?|mts)$/;

function listFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) listFiles(full, out);
    } else if (SOURCE_FILE.test(entry.name)) {
      out.push(full);
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Листья дерева: строки, функции, массивы — всё, что не вложенный объект. */
function listKeys(): { leaves: string[]; objects: Set<string> } {
  const leaves: string[] = [];
  const objects = new Set<string>();
  const walk = (value: unknown, path: string[]) => {
    if (isPlainObject(value)) {
      objects.add(path.join("."));
      for (const [key, child] of Object.entries(value)) walk(child, [...path, key]);
    } else {
      leaves.push(path.join("."));
    }
  };
  for (const [domain, value] of Object.entries(UI_TEXT)) walk(value, [domain]);
  return { leaves, objects };
}

function collectAccess(): TextKeyAccess[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) listFiles(join(ROOT, dir), files);
  const access: TextKeyAccess[] = [];
  for (const file of files) {
    if (file === SELF || file === TEXT_BARREL || file.startsWith(TEXT_DIR + sep)) continue;
    const text = readFileSync(file, "utf8");
    if (!text.includes("@/lib/ui/text")) continue;
    access.push(...readTextKeyAccessFromSource(text, relative(ROOT, file)));
  }
  return access;
}

describe("UI-TEXT-DEAD-KEY-SWEEP · ключ UI_TEXT без читателя", () => {
  const { leaves, objects } = listKeys();
  const leafSet = new Set(leaves);
  const access = collectAccess();

  const used = new Set<string>();
  const wholePrefixes = new Set<string>();
  for (const { path, kind } of access) {
    // Укорачиваем до известного узла: `T.items.map` → `items`.
    let segments = path;
    while (segments.length > 0 && !leafSet.has(segments.join(".")) && !objects.has(segments.join("."))) {
      segments = segments.slice(0, -1);
    }
    const key = segments.join(".");
    if (segments.length === 0) {
      if (kind === "whole" && path.length === 0) wholePrefixes.add("");
      continue;
    }
    if (leafSet.has(key)) used.add(key);
    else if (kind === "whole") wholePrefixes.add(key);
  }

  const covered = (leaf: string): boolean => {
    if (used.has(leaf)) return true;
    if (wholePrefixes.has("")) return true;
    const parts = leaf.split(".");
    for (let i = 1; i < parts.length; i += 1) {
      if (wholePrefixes.has(parts.slice(0, i).join("."))) return true;
    }
    return false;
  };

  it("разбор находит читателей", () => {
    // Не-вакуумность: и прямое чтение, и псевдоним, и поддерево «целиком».
    expect(leaves.length).toBeGreaterThan(4000);
    expect(used.has("common.save") || used.size > 3000).toBe(true);
    expect(used.has("guestManage.copied")).toBe(true);
    expect(wholePrefixes.size).toBeGreaterThan(10);
    // «Всё целиком» без пути выключило бы сторож — такого обращения нет.
    expect(wholePrefixes.has("")).toBe(false);
  });

  it("у каждого ключа есть читатель", () => {
    const dead = leaves.filter((leaf) => !covered(leaf));
    expect(dead, "ключ без читателя — удалите его из файла домена (src/lib/ui/text/<домен>.ts)").toEqual([]);
  });
});
