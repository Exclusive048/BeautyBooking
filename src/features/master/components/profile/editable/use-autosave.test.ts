import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { safeSave } from "./use-autosave";

/**
 * RES-07 — сетевой сбой оставлял автосейв профиля в статусе «сохраняется»
 * навсегда и молча терял правку.
 *
 * Механика: `fetch` бросает при offline/обрыве DNS (в отличие от 4xx/5xx,
 * которые возвращают `response.ok === false`), ни один из четырёх
 * save-callback'ов профиля его не ловил, а хук уже успел выставить
 * «сохраняется». Ветка `setStatus("error")` при броске недостижима — чип
 * крутится вечно, пользователь уверен, что сохранено.
 *
 * Проверяется свойство «save-callback не бросает наружу», а не конкретный
 * вызывающий: их четыре, и пятый обязан унаследовать поведение.
 */

const EDITABLE_DIR = resolve(
  process.cwd(),
  "src/features/master/components/profile/editable"
);

describe("RES-07 · автосейв профиля переживает сетевой сбой", () => {
  it("бросок save-callback превращается в неуспешный результат, а не в throw", async () => {
    const save = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(safeSave(save, "value")).resolves.toEqual({ ok: false });
  });

  it("успешный результат проходит насквозь без изменений", async () => {
    await expect(safeSave(async () => ({ ok: true }), "v")).resolves.toEqual({ ok: true });
  });

  it("неуспешный результат с сообщением сервера не теряет сообщение", async () => {
    await expect(
      safeSave(async () => ({ ok: false, message: "Такой адрес уже занят." }), "v")
    ).resolves.toEqual({ ok: false, message: "Такой адрес уже занят." });
  });

  it("прогон хука зовёт save только через safeSave", () => {
    // Иначе нормализация есть, а прогон её обходит: статус снова подвисает.
    const source = readFileSync(join(EDITABLE_DIR, "use-autosave.ts"), "utf8");
    expect(source).toMatch(/await safeSave\(save, value\)/);
    // Единственный прямой вызов — внутри самой обёртки, до объявления хука.
    const direct = source.match(/await save\(/g) ?? [];
    expect(direct).toHaveLength(1);
    expect(source.indexOf("await save(")).toBeLessThan(source.indexOf("export function useAutosave"));
  });

  it("ни одна editable-поверхность профиля не оставляет сетевой бросок без обработки", () => {
    // Либо через `useAutosave` (обработка в обёртке), либо собственный
    // `try/catch`. Голый `fetch` без того и другого — возврат дефекта.
    const offenders = readdirSync(EDITABLE_DIR)
      .filter((file) => file.endsWith(".tsx"))
      .filter((file) => {
        const source = readFileSync(join(EDITABLE_DIR, file), "utf8");
        if (!/\bfetch\(/.test(source)) return false;
        return !/useAutosave/.test(source) && !/\bcatch\b/.test(source);
      });
    expect(offenders).toEqual([]);
  });
});
