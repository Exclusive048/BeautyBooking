import {
  FORBIDDEN_PHRASES,
  FORBIDDEN_RULES,
  type ForbiddenCategory,
  type ForbiddenRule,
} from "@/lib/moderation/forbidden-word-list";

/**
 * FORBIDDEN-WORDS-01 — проверка публичного текста на запрещённые слова.
 * Словарь и правила записи — `forbidden-word-list.ts`. Модуль без серверных
 * зависимостей: им может пользоваться и форма в браузере.
 *
 * Обходы, которые снимает нормализация:
 *  · латиница вместо кириллицы в русском слове («xyй», «cyka») и цифры
 *    вместо букв («3» → «з», «0» → «о», «@» → «а»);
 *  · разрядка («х у й», «х.у.й», «х-у-й») — одиночные буквы склеиваются;
 *  · растягивание («хуууй») — повторы букв схлопываются;
 *  · звёздочка вместо буквы («п*зда») — перебор гласных на её месте;
 *  · «ё» → «е», «ъ» → «ь».
 */

export type ForbiddenScope =
  /** Свободный текст: описание, отзыв, подпись. Без правила «выдача себя за платформу». */
  | "text"
  /** Имя, название, адрес страницы: все правила. */
  | "name";

export type ForbiddenMatch = {
  category: ForbiddenCategory;
  /** Слово в нормализованной форме — для лога; пользователю не показывается. */
  word: string;
};

const LATIN_LOOKALIKE: Record<string, string> = {
  a: "а", b: "в", c: "с", e: "е", h: "н", k: "к", m: "м", o: "о", p: "р", t: "т", x: "х", y: "у", u: "и",
  "3": "з", "0": "о", "4": "ч", "6": "б", "@": "а",
};

const VOWELS_FOR_STAR = ["и", "у", "е", "а", "о", "ы", "я", "ю", "i", "u", "e", "a", "o", "y"];

const CYRILLIC = /[а-я]/;
const LATIN = /[a-z]/;

function collapseRepeats(word: string): string {
  return word.replace(/(.)\1+/g, "$1");
}

/** Латинские двойники букв → кириллица, но только в слове, где есть кириллица
 *  или где ВСЕ латинские буквы — двойники («cyka» → «сука», «hello» — нет). */
function cyrillicize(word: string): string | null {
  if (!LATIN.test(word) && !/[3046@]/.test(word)) return null;
  const hasCyrillic = CYRILLIC.test(word);
  let out = "";
  for (const ch of word) {
    const mapped = LATIN_LOOKALIKE[ch];
    if (mapped) {
      out += mapped;
    } else if (LATIN.test(ch)) {
      if (!hasCyrillic) return null;
      out += ch;
    } else {
      out += ch;
    }
  }
  return out;
}

function baseNormalize(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/ё/g, "е").replace(/ъ/g, "ь");
}

/** Слова текста: буквы, цифры-двойники, «@» и «*»; разрядка одиночными буквами склеена. */
export function tokenize(text: string): string[] {
  const raw = baseNormalize(text)
    .split(/[^a-zа-я0-9@*]+/u)
    .filter(Boolean);
  const words: string[] = [];
  let run = "";
  for (const token of raw) {
    // «х у й» / «х.у.й» — одиночные буквы подряд собираются в слово.
    if (token.length === 1 && /[a-zа-я*]/.test(token)) {
      run += token;
      continue;
    }
    if (run) {
      words.push(run);
      run = "";
    }
    words.push(token);
  }
  if (run) words.push(run);
  return words;
}

/** Все формы слова, по которым идёт сравнение. */
function variants(word: string): string[] {
  const forms = new Set<string>();
  const add = (form: string) => {
    if (!form) return;
    forms.add(form);
    forms.add(collapseRepeats(form));
  };
  const starForms = word.includes("*")
    ? VOWELS_FOR_STAR.map((v) => word.replace(/\*/g, v))
    : [word];
  for (const form of starForms) {
    add(form);
    const cyr = cyrillicize(form);
    if (cyr) add(cyr);
  }
  return [...forms];
}

function ruleMatches(rule: ForbiddenRule, word: string): boolean {
  if (rule.except?.includes(word)) return false;
  for (const root of rule.roots) {
    if (rule.match === "exact") {
      if (word === root) return true;
    } else if (rule.match === "anywhere") {
      if (word.includes(root)) return true;
    } else {
      if (word.startsWith(root)) return true;
      for (const prefix of rule.prefixes ?? []) {
        if (word.startsWith(prefix + root)) return true;
      }
    }
  }
  return false;
}

function phraseMatch(text: string): ForbiddenMatch | null {
  const compact = baseNormalize(text).replace(/[^a-zа-я]+/gu, "");
  for (const { phrase, category } of FORBIDDEN_PHRASES) {
    if (compact.includes(phrase)) return { category, word: phrase };
  }
  return null;
}

export function findForbiddenWord(text: string | null | undefined, scope: ForbiddenScope): ForbiddenMatch | null {
  if (!text) return null;
  const rules = scope === "name" ? FORBIDDEN_RULES : FORBIDDEN_RULES.filter((r) => r.category !== "impersonation");
  for (const word of tokenize(text)) {
    for (const form of variants(word)) {
      for (const rule of rules) {
        if (ruleMatches(rule, form)) return { category: rule.category, word: form };
      }
    }
  }
  return phraseMatch(text);
}

export function hasForbiddenWords(text: string | null | undefined, scope: ForbiddenScope): boolean {
  return findForbiddenWord(text, scope) !== null;
}
