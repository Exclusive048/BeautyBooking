import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ROOT } from "@/lib/testing/client-graph";
import { stripComments } from "@/lib/testing/source-scan";

/**
 * CHECK-ERROR-TEMPLATE — текст ошибки в `UI_TEXT` идёт по канону.
 *
 * Канон (CLAUDE.md § Стиль кода, UI-17): «Не удалось {действие}. Попробуйте ещё
 * раз.» Хвост не дописывается, только если у строки есть СВОЯ, более конкретная
 * подсказка («Проверьте дату и время.», «Выберите другой.») — она полезнее канона,
 * и замена её на канон — деградация. UI-17 привёл к канону 170 строк из 302;
 * сторожа не было, поэтому за время разработки отклонились две трети.
 *
 * Что проверяется: каждый строковый литерал в файлах доменов
 * `src/lib/ui/text/*.ts` (исходник без комментариев), начинающийся с
 * «Не удалось», либо имеет ровно форму канона — одна фраза без своих точек +
 * хвост, — либо несёт маркер `error-hint-ok: <почему без хвоста>`
 * в комментарии не дальше двух строк над литералом (так помещается и форма
 * `// маркер` / `ключ:` / `"строка"`). Маркер, под которым такой строки нет, —
 * красный: исключение не переживает свой повод.
 *
 * Вне области: заголовки error-boundary («Что-то пошло не так», «Ошибка в
 * кабинете» — у каждого рядом канонический подзаголовок) и статус-метки
 * («Ошибка» в ряду статусов платежа) — это не сообщения о неудавшемся
 * действии, и шаблон к ним неприменим. Серверные сообщения (`fail()` /
 * `AppError`) — у них свой гейт языка, `check:error-message-lang`.
 *
 * Слепые формы: строка, собранная конкатенацией (`"Не удалось " + x`), и
 * шаблон, где «Не удалось» стоит не в начале (`` `${who}: Не удалось …` ``).
 *
 * @probe 2026-10-10 — каждая проба меняет одну ось, наблюдалось:
 *   (1) `chat.ts` `attachUploadFailed` — хвост снят («Не удалось загрузить
 *       фото.»): красный «строка по канону или с маркером»
 *       (`+ "chat.ts:130 Не удалось загрузить фото."`).
 *   (2) там же хвост с «е» вместо «ё» («Попробуйте еще раз.»): тот же красный —
 *       канон сверяется дословно, а не «похоже на хвост».
 *   (3) `home.ts` — маркер над «Не удалось выполнить поиск. Попробуйте позже.»
 *       удалён: тот же красный (`+ "home.ts:61 …"`).
 *   (4) `chat.ts` — `attachmentLoadFailed` переписан в канон, маркер оставлен:
 *       красный «каждый маркер стоит над строкой не по канону»
 *       (`+ "chat.ts:138"`).
 *   (5) `master.ts` — у маркера стёрта причина (`// error-hint-ok:`): красный
 *       «маркер называет подсказку» (`+ "master.ts:429"`).
 *   (6) в `guest-manage.ts` добавлена функция-шаблон
 *       `` (what) => `Не удалось ${what}.` ``: красный «строка по канону или
 *       с маркером» — шаблонные литералы тоже в области.
 *   (7) обратная: там же комментарий с «Не удалось скопировать» без хвоста —
 *       зелёный, проза не судится (общий `stripComments`, FIX-C5).
 *   Возвращено — 4/4 зелёные.
 */

const TEXT_DIR = join(ROOT, "src", "lib", "ui", "text");
const PREFIX = "Не удалось";
const CANON = /^Не удалось [^.!?]+\. Попробуйте ещё раз\.$/;
const MARKER = /error-hint-ok:(.*)$/;
const MARKER_REACH = 2;
const LITERAL = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;

type Literal = { file: string; line: number; text: string };
type Marker = { file: string; line: number; reason: string };

function scan(): { literals: Literal[]; markers: Marker[] } {
  const literals: Literal[] = [];
  const markers: Marker[] = [];
  for (const name of readdirSync(TEXT_DIR).filter((n) => n.endsWith(".ts")).sort()) {
    const raw = readFileSync(join(TEXT_DIR, name), "utf8").replace(/\r\n/g, "\n");
    const code = stripComments(raw);
    for (const m of code.matchAll(LITERAL)) {
      const text = m[2]!;
      if (!text.startsWith(PREFIX)) continue;
      const line = code.slice(0, m.index).split("\n").length;
      literals.push({ file: name, line, text });
    }
    raw.split("\n").forEach((lineText, index) => {
      const marker = lineText.match(MARKER);
      if (marker) markers.push({ file: name, line: index + 1, reason: marker[1]!.trim() });
    });
  }
  return { literals, markers };
}

function covers(marker: Marker, literal: Literal): boolean {
  return (
    marker.file === literal.file &&
    literal.line > marker.line &&
    literal.line - marker.line <= MARKER_REACH
  );
}

describe("CHECK-ERROR-TEMPLATE · текст ошибки в UI_TEXT по канону", () => {
  const { literals, markers } = scan();
  const offCanon = literals.filter((l) => !CANON.test(l.text));

  it("набор не пуст", () => {
    // Не-вакуумность: разборщик обязан находить канонические строки.
    expect(literals.length).toBeGreaterThan(250);
    expect(literals.some((l) => l.text === "Не удалось загрузить фото. Попробуйте ещё раз.")).toBe(true);
  });

  it("строка по канону или с маркером", () => {
    const bare = offCanon
      .filter((l) => !markers.some((m) => covers(m, l)))
      .map((l) => `${l.file}:${l.line} ${l.text}`);
    expect(bare, "«Не удалось {действие}. Попробуйте ещё раз.» либо своя подсказка с `error-hint-ok:`").toEqual([]);
  });

  it("каждый маркер стоит над строкой не по канону", () => {
    const stale = markers
      .filter((m) => !offCanon.some((l) => covers(m, l)))
      .map((m) => `${m.file}:${m.line}`);
    expect(stale).toEqual([]);
  });

  it("маркер называет подсказку", () => {
    const empty = markers.filter((m) => m.reason.length < 3).map((m) => `${m.file}:${m.line}`);
    expect(empty).toEqual([]);
  });
});
