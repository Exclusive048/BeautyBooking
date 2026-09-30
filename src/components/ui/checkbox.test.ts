/**
 * UI-15 — чекбокс в проекте один.
 *
 * Дефект был не «некрасиво», а разъезд четырёх оформлений, у которого нижняя
 * точка пришлась на самое дорогое действие продукта: подтверждение удаления
 * аккаунта стояло на СЫРОМ чекбоксе браузера. Разъезд накопился именно потому,
 * что общего компонента не было, — каждый новый сайт копировал ближайший, и
 * копировать было нечего.
 *
 * Guard ОБРАТНЫЙ, как #35/#38/SEC-29 и UI-13: он перечисляет, кому можно
 * ставить `type="checkbox"` мимо общего компонента, и требует причину. Новый
 * сайт валит CI просто потому, что его нет в списке, — а не потому, что кто-то
 * заметил лишний `accent-primary` на ревью.
 *
 * Не-вакуумность: прогонялось (а) с возвращённым сырым чекбоксом в
 * `DeleteAccountModal`; (б) со снятым `focus-visible:ring-2`; (в) со снятым
 * `accent-primary`; (г) с дописанным `rounded border border-border-control
 * bg-bg-card` (мёртвые для нативного чекбокса классы); (д) со снятым `sr-only`
 * у единственного исключения — краснеет на каждом.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");
const COMPONENT = "components/ui/checkbox.tsx";

/**
 * Кому можно объявлять `type="checkbox"` мимо `Checkbox` — с причиной.
 * Запись сюда обязана называть, ЧЕМ это не чекбокс.
 */
const RAW_CHECKBOX_ALLOWED: Record<string, string> = {
  // Пусто с 29.09 доработки · 22 (решение владельца 22.1): единственное
  // исключение — переключатель «Хочу помолчать» в записи в студию
  // (`you-step.tsx`, `sr-only`-поле под самодельной дорожкой) — переведено на
  // общий `Switch`. Он — `<button role="switch">` внутри той же `<label>`, и
  // клик по карточке с подписью по-прежнему переключает его: label активирует
  // вложенную кнопку. Проверки ниже про исключения срабатывают, как только
  // сюда кто-то что-то впишет.
};

function walk(dir: string, ext: readonly string[] = [".tsx"]): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full, ext);
    return ext.some((suffix) => full.endsWith(suffix)) ? [full] : [];
  });
}

function rel(file: string): string {
  return file.slice(SRC.length + 1).split(sep).join("/");
}

/** Код без комментариев — иначе в улики попадут упоминания из них. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** Файлы, где `type="checkbox"` стоит в РАЗМЕТКЕ, а не в тексте комментария. */
function filesWithRawCheckbox(): string[] {
  return walk(SRC).filter((file) => /type\s*=\s*["']checkbox["']/.test(code(file)));
}

describe("UI-15 — общий чекбокс", () => {
  it("сырой type=\"checkbox\" живёт только в общем компоненте", () => {
    const offenders = filesWithRawCheckbox()
      .map(rel)
      .filter((path) => path !== COMPONENT)
      .filter((path) => !(path in RAW_CHECKBOX_ALLOWED));

    expect(offenders).toEqual([]);
  });

  it("исключения не протухли — каждое всё ещё держит сырое поле", () => {
    // Иначе список начнёт разрешать то, чего уже нет, и прикроет собой файл,
    // который однажды займёт тот же путь.
    const raw = new Set(filesWithRawCheckbox().map(rel));
    for (const path of Object.keys(RAW_CHECKBOX_ALLOWED)) {
      expect(raw.has(path), `исключение ${path} больше не держит чекбокс`).toBe(true);
    }
  });

  it("исключение остаётся переключателем, а не превращается в чекбокс", () => {
    // Право стоять мимо общего компонента дано за то, что поле СКРЫТО и
    // состояние рисует своя разметка. Уберут `sr-only` — это снова чекбокс,
    // и он обязан вернуться к общему.
    for (const path of Object.keys(RAW_CHECKBOX_ALLOWED)) {
      const source = code(join(SRC, ...path.split("/")));
      expect(source, `${path}: поле больше не скрыто`).toMatch(/sr-only/);
    }
  });

  it("компонент несёт то, что доходит до пикселей", () => {
    // Именно `code()`, а не сырой файл: шапка компонента объясняет, почему
    // `border`/`bg` тут мертвы, и на упоминаниях из неё проверка «мёртвые
    // классы не вернулись» краснела бы на исправном коде.
    const source = code(join(SRC, ...COMPONENT.split("/")));

    // Бренд-акцент: без него галочка системно-синяя (`accent-color: auto` —
    // ровно так и выглядел `DeleteAccountModal`). Единственное, чем чекбокс
    // вообще можно перекрасить, не отказываясь от нативной отрисовки.
    expect(source, "нет accent-primary").toMatch(/accent-primary/);

    // Базовый слой `globals.css` гасит `outline` у всех полей
    // (`input:focus { outline: none }`), поэтому системного кольца у чекбокса
    // нет — индикатор фокуса обязан быть свой.
    expect(source, "нет кольца фокуса").toMatch(/focus-visible:ring-2/);
  });

  it("мёртвые для нативного чекбокса классы не возвращаются", () => {
    // У поля с `appearance: auto` браузер рисует контрол сам: авторские
    // `border-*`, `bg-*` и `rounded` не доходят до пикселей (проверено
    // подстановкой `#ff0000` + `3px solid #00ff00` в рантайме — картинка
    // не изменилась, `border-width` при этом computed `0px`).
    //
    // Держать их в общем компоненте хуже, чем не иметь: они выглядят как
    // работающее оформление, и следующий автор скопирует их дальше — это тот
    // же класс дефекта, который UI-01…UI-08 вычищали из разметки.
    //
    // ⚠️ Если чекбокс когда-нибудь переведут на `appearance: none` с
    // собственной отрисовкой — это ОСОЗНАННЫЙ редизайн всех сайтов, и снимать
    // проверку надо вместе с ним, а не потому, что «класс же осмысленный».
    const source = code(join(SRC, ...COMPONENT.split("/")));
    for (const dead of [/\bborder-border-\w+/, /\bbg-bg-\w+/, /\brounded\b/]) {
      expect(source, `вернулся мёртвый класс ${dead}`).not.toMatch(dead);
    }
  });
});
