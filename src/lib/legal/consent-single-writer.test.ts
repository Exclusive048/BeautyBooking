import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import { describe, it, expect } from "vitest";

/**
 * Инвариант #37 — `UserConsent` пишет ТОЛЬКО `src/lib/legal/consent.ts`.
 *
 * Почему это guard, а не соглашение. Строка `UserConsent` — единственное
 * доказательство законности обработки ПДн (152-ФЗ ст. 9). Ценность у него
 * ровно постольку, поскольку известно, ЧТО его породило: реальная версия
 * документа, реальные IP/UA, реальный affirmative act пользователя. Второй
 * writer где-нибудь в роуте, пишущий `documentVersion: "1.0"` руками или
 * создающий строку до отказа во флоу, обесценивает весь журнал — и, в отличие
 * от обычного бага, обнаружится это только на проверке РКН.
 *
 * Отдельно про anti-forgery: `recordGuestConsents` не даёт анониму записать
 * согласие на established-профиль (`isGuestClassProfile`). Любой обход
 * единственного writer'а обходит и эту проверку.
 *
 * Форма — как у инв. #25 (`client-privacy.test.ts`) и no-token-columns
 * (`provider-tokens-at-rest.test.ts`): source-level regex по дереву. Прогнан
 * с подсаженным нарушением — падает и называет файл.
 */

/** Единственный легитимный writer. Пути — POSIX-нормализованные, относительно корня репо. */
const WRITER = "src/lib/legal/consent.ts";

/**
 * Тесты читают/строят фикстуры `UserConsent` и обязаны это делать — они
 * проверяют сам writer и удаление аккаунта. Guard смотрит на production-код.
 */
const isTestFile = (p: string) => /\.test\.tsx?$/.test(p);

/** Мутирующие Prisma-операции над моделью. `findMany`/`count` — чтение, их не трогаем. */
const MUTATING = ["create", "createMany", "upsert", "update", "updateMany", "delete", "deleteMany"];

const WRITE_RE = new RegExp(`userConsent\\s*\\.\\s*(${MUTATING.join("|")})\\b`);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(full)) acc.push(full);
  }
  return acc;
}

/** Вырезает комментарии — они legitimно обсуждают запись согласий. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("инвариант #37 — UserConsent single writer", () => {
  const root = resolve("src");
  const files = walk(root);

  it("никто, кроме lib/legal/consent.ts, не мутирует UserConsent", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const rel = file.slice(resolve(".").length + 1).split(sep).join("/");
      if (rel === WRITER || isTestFile(rel)) continue;
      if (WRITE_RE.test(stripComments(readFileSync(file, "utf8")))) offenders.push(rel);
    }

    expect(
      offenders,
      `Запись UserConsent вне единственного writer'а: ${offenders.join(", ")}.\n` +
        `Все согласия пишутся через recordUserConsents / recordGuestConsents из ${WRITER} — ` +
        "они проставляют реальные версии документов из lib/legal/documents.ts, IP/UA, " +
        "идемпотентны по (userId, consentType, documentVersion) и содержат anti-forgery-" +
        "предикат isGuestClassProfile. Прямая запись обходит всё перечисленное и делает " +
        "журнал согласий недоказуемым (152-ФЗ ст. 9).",
    ).toEqual([]);
  });

  it("сам writer на месте и действительно пишет (guard не вакуумен по второй стороне)", () => {
    const source = stripComments(readFileSync(resolve(WRITER), "utf8"));
    expect(source).toMatch(WRITE_RE);
  });

  it("enforcement живёт до создания сущности, а не после", () => {
    // `assertRequiredConsents` — то, что отказывает во флоу; writer намеренно
    // не бросает (иначе сбой записи ронял бы логин). Обе половины должны
    // существовать: без первой отказ негде сделать, без второй запись убивает флоу.
    const source = readFileSync(resolve(WRITER), "utf8");
    expect(source).toContain("export function assertRequiredConsents");
    expect(source).toContain("export async function recordUserConsents");
    expect(source).toContain("export async function recordGuestConsents");
    expect(source).toContain("isGuestClassProfile");
  });

  it("отзыв — тоже часть единственного writer'а (RKN-FIX-18)", () => {
    // Отзыв мутирует ту же таблицу, значит на него распространяется тот же
    // инвариант: снаружи `consent.ts` никто не проставляет `revokedAt`.
    const source = readFileSync(resolve(WRITER), "utf8");
    expect(source).toContain("export async function revokeConsent");
    expect(source).toContain("export function isSelfRevocable");
    // Граница скоупа зашита в writer, а не в UI: маркетинг отзывается,
    // ПДн/оферта — нет (это запрос на удаление, FIX-03-B).
    expect(source).toContain("CONSENT_NOT_SELF_REVOCABLE");
  });

  it("НИКТО, кроме writer'а, не проставляет revokedAt на UserConsent", () => {
    // Отдельная проверка от общей: `revokedAt` можно записать и через
    // `update`, и через `updateMany`, и это ровно тот путь, которым легко
    // «выключить рассылку» мимо журнала.
    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.slice(resolve(".").length + 1).split(sep).join("/");
      if (rel === WRITER || isTestFile(rel)) continue;
      const code = stripComments(readFileSync(file, "utf8"));
      // Грубо, но по делу: упоминание revokedAt рядом с userConsent-мутацией.
      if (WRITE_RE.test(code) && /revokedAt/.test(code)) offenders.push(rel);
    }
    expect(
      offenders,
      `Проставление revokedAt вне ${WRITER}: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
