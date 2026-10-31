import { JOURNAL_SEARCH_MAX_LENGTH } from "./journal-params";

/**
 * BOOKINGS-JOURNAL — разбор строки поиска журнала записей.
 *
 * Строка одна на всё: имя и фамилия клиента, имя мастера (у студии), услуга,
 * телефон. Слова ищутся НЕЗАВИСИМО друг от друга и все сразу: «Иванова
 * Мария» и «Мария Иванова» находят одну и ту же запись, хотя у клиента с
 * аккаунтом имя и фамилия лежат в разных полях, а у записи — одной строкой.
 * Набор цифр — телефон: «8 999 123-45-67», «+7 (999) 123» и «9991234» ищутся
 * по цифрам (номер хранится как `+7…`, поэтому ведущая восьмёрка ищется
 * и как семёрка).
 */

export type JournalSearchToken =
  | { kind: "text"; value: string }
  | { kind: "digits"; variants: string[] };

/** Слов больше — запрос не станет точнее, а условие станет тяжелее. */
export const JOURNAL_SEARCH_MAX_TOKENS = 5;
/** Короче трёх цифр — это не телефон, а часть чего угодно. */
const MIN_PHONE_DIGITS = 3;
const PHONE_PUNCTUATION = /[\s()+\-.]/g;
const EDGE_PUNCTUATION = /^[,;.]+|[,;.]+$/g;

function phoneVariants(digits: string): string[] {
  const variants = [digits];
  if (digits.startsWith("8") && digits.length > 1) variants.push(`7${digits.slice(1)}`);
  return variants;
}

function asPhoneDigits(value: string): string | null {
  const compact = value.replace(PHONE_PUNCTUATION, "");
  if (compact.length < MIN_PHONE_DIGITS || !/^\d+$/.test(compact)) return null;
  return compact;
}

export function tokenizeJournalSearch(raw: string | null | undefined): JournalSearchToken[] {
  const trimmed = (raw ?? "").trim().slice(0, JOURNAL_SEARCH_MAX_LENGTH);
  if (!trimmed) return [];

  // Весь запрос — номер, набранный с пробелами и скобками: один токен.
  const wholePhone = asPhoneDigits(trimmed);
  if (wholePhone) return [{ kind: "digits", variants: phoneVariants(wholePhone) }];

  const tokens: JournalSearchToken[] = [];
  const seen = new Set<string>();
  for (const word of trimmed.split(/\s+/)) {
    if (tokens.length >= JOURNAL_SEARCH_MAX_TOKENS) break;
    const cleaned = word.replace(EDGE_PUNCTUATION, "");
    if (!cleaned) continue;
    const digits = asPhoneDigits(cleaned);
    const key = digits ? `d:${digits}` : `t:${cleaned.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(digits ? { kind: "digits", variants: phoneVariants(digits) } : { kind: "text", value: cleaned });
  }
  return tokens;
}
