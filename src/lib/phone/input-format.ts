import { normalizeRussianPhone } from "@/lib/phone/russia";

/**
 * PHONE-CLAIM-01 — прогрессивная маска «+7 (999) 123-45-67» для полей ввода
 * телефона в кабинетах. Client-safe, зависимостей нет.
 *
 * Контракт:
 *  - вход — любая строка (набор, вставка «8 999…», «+7999…», мусор);
 *  - выход — канонично отформатированный ПРЕФИКС маски по имеющимся цифрам;
 *  - идемпотентна: format(format(x)) === format(x) — поэтому ею можно
 *    форматировать и ввод, и значение с сервера (`+7XXXXXXXXXX`);
 *  - пустой ввод остаётся пустым (поле можно очистить);
 *  - полный результат всегда принимается `normalizeRussianPhone` — маска
 *    использует только разделители, которые тот вычищает.
 */

/**
 * 10 значащих цифр номера (без кода страны), из любой формы ввода.
 *
 * Лидирующая 7/8 срезается ВСЕГДА: в плане нумерации РФ локальная часть после
 * +7 начинается с 3/4/8/9, но «8…» в начале ввода — это межгородский префикс
 * («8 999 …»), а «7…» — код страны («+7…», «7999…»); собственный вывод маски
 * тоже начинается с «+7». Единственная жертва — набранный БЕЗ префикса
 * toll-free «800…» (10 цифр с восьмёрки), который персональным контактом не
 * бывает; вставка «+7 800 …» работает корректно.
 */
export function russianPhoneDigits(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("7") || digits.startsWith("8")) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

export function formatRussianPhoneInput(raw: string): string {
  if (raw.trim().length === 0) return "";
  const digits = russianPhoneDigits(raw);
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 8);
  const p4 = digits.slice(8, 10);
  let out = "+7";
  if (p1) out += ` (${p1}${p1.length === 3 ? ")" : ""}`;
  if (p2) out += ` ${p2}`;
  if (p3) out += `-${p3}`;
  if (p4) out += `-${p4}`;
  return out;
}

/**
 * Форматирование на onChange с обработкой «липкой маски»: Backspace на
 * разделителе («)», «-», пробел) не меняет набор цифр, и наивный reformat
 * возвращал бы ту же строку — поле «не удалялось» бы. Если ввод стал короче,
 * а цифры не изменились, срезается ещё и последняя цифра.
 */
export function formatRussianPhoneInputOnChange(previousFormatted: string, next: string): string {
  if (next.trim().length === 0) return "";
  const prevDigits = russianPhoneDigits(previousFormatted);
  let nextDigits = russianPhoneDigits(next);
  if (next.length < previousFormatted.length && nextDigits === prevDigits) {
    nextDigits = nextDigits.slice(0, -1);
  }
  if (nextDigits.length === 0) {
    // Остались одни разделители: удаление последней цифры оставляет якорь
    // «+7», удаление самого якоря очищает поле.
    return next.length < previousFormatted.length && prevDigits.length === 0 ? "" : "+7";
  }
  return formatRussianPhoneInput(`+7${nextDigits}`);
}

/** Полный ли номер набран (пригоден для сохранения). */
export function isCompleteRussianPhoneInput(value: string): boolean {
  return normalizeRussianPhone(value) !== null;
}
