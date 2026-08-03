#!/usr/bin/env node
/**
 * GATES-FIX-01 — гейт против самой дорогой ловушки миграций в этом проекте.
 *
 * ## Что ловим
 *
 * `prisma migrate dev` при генерации ЛЮБОЙ новой миграции дописывает в неё
 * `DROP INDEX "media_asset_embeddings_embedding_hnsw_idx";` — потому что этот
 * индекс живёт в сыром SQL и Prisma не видит его в датамодели
 * (см. scripts/raw-sql-objects.mjs).
 *
 * Это уже случилось **дважды** — RKN-FIX-12 и RKN-FIX-10, оба раза строку
 * снимали вручную при code-review. То есть механизм срабатывает
 * гарантированно, а защита держится на внимательности человека, который в
 * этот момент думает про свою фичу, а не про pgvector.
 *
 * Цена пропуска: применённый DROP превращает ANN-поиск visual-search в
 * seq-scan по всей таблице эмбеддингов. **Молча** — ни ошибки, ни
 * предупреждения, только деградация, которую заметят нескоро.
 *
 * ## Почему это отдельный гейт от check:schema-drift
 *
 * Тот отвечает на вопрос «схема и миграции разошлись?». Этот — «в миграцию
 * уехало то, чего автор не заметил?». Зелёный drift-гейт ничего не говорит о
 * содержимом свежего файла миграции; ловушка живёт именно там.
 *
 * ## Как разрешить намеренный дроп
 *
 * Если объект удаляется осознанно — поставить маркер рядом:
 *
 *   -- ALLOW-DROP: media_asset_embeddings_embedding_hnsw_idx — переходим на ivfflat
 *   DROP INDEX "media_asset_embeddings_embedding_hnsw_idx";
 *
 * Маркер обязан упоминать имя объекта. Смысл — превратить удаление в
 * осознанное действие, а не в побочный эффект непрочитанной генерации.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  ALLOW_DROP_MARKER,
  RAW_SQL_OBJECTS,
  RAW_SQL_OBJECT_NAMES,
} from "./raw-sql-objects.mjs";

const MIGRATIONS_DIR = "prisma/schema/migrations";

/** DROP INDEX / DROP TABLE / DROP CONSTRAINT … с именем объекта. */
const DROP_RE = /\bDROP\s+(INDEX|TABLE|CONSTRAINT|TYPE)\b[^;]*/gi;

function migrationFiles() {
  let entries;
  try {
    entries = readdirSync(MIGRATIONS_DIR);
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const dir = join(MIGRATIONS_DIR, entry);
    if (!statSync(dir).isDirectory()) continue;
    const sql = join(dir, "migration.sql");
    try {
      if (statSync(sql).isFile()) files.push({ name: entry, path: sql });
    } catch {
      // каталог без migration.sql — не наше дело
    }
  }
  return files;
}

/** Строки-маркеры `-- ALLOW-DROP: <name>` в файле. */
function allowedDropsIn(source) {
  const allowed = new Set();
  for (const line of source.split(/\r?\n/)) {
    const idx = line.indexOf(ALLOW_DROP_MARKER);
    if (idx === -1) continue;
    const rest = line.slice(idx + ALLOW_DROP_MARKER.length);
    for (const name of RAW_SQL_OBJECT_NAMES) {
      if (rest.includes(name)) allowed.add(name);
    }
  }
  return allowed;
}

const violations = [];

for (const file of migrationFiles()) {
  const source = readFileSync(file.path, "utf-8");
  const allowed = allowedDropsIn(source);

  // Комментарии игнорируем: миграции RKN-FIX-12/-10 ОБСУЖДАЮТ снятый DROP в
  // пояснительном комментарии, и это правильный текст, а не нарушение.
  const code = source
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  for (const match of code.match(DROP_RE) ?? []) {
    for (const obj of RAW_SQL_OBJECTS) {
      if (!match.includes(obj.name)) continue;
      if (allowed.has(obj.name)) continue;
      violations.push({ migration: file.name, path: file.path, object: obj, statement: match.trim() });
    }
  }
}

if (violations.length === 0) {
  const files = migrationFiles().length;
  console.log(
    `MIGRATION-DROPS: OK — ${files} миграций проверено, незаявленных дропов защищённых объектов нет (реестр: ${RAW_SQL_OBJECTS.length}).`
  );
  process.exit(0);
}

console.error("");
console.error("🚨 MIGRATION-DROPS: в миграцию уехал DROP защищённого объекта");
console.error("");
for (const v of violations) {
  console.error(`  Миграция: ${v.migration}`);
  console.error(`  Файл:     ${v.path}`);
  console.error(`  SQL:      ${v.statement}`);
  console.error(`  Объект:   ${v.object.name} (${v.object.table})`);
  console.error(`  Почему он в сыром SQL: ${v.object.why}`);
  console.error(`  Цена потери: ${v.object.costIfLost}`);
  console.error("");
}
console.error("Скорее всего это НЕ то, что вы хотели: `prisma migrate dev` дописывает");
console.error("такой DROP в каждую новую миграцию сам, потому что не видит объект в");
console.error("датамодели. Так уже было дважды (RKN-FIX-12, RKN-FIX-10).");
console.error("");
console.error("Что делать:");
console.error("  • В 99% случаев — просто УДАЛИТЬ строку из migration.sql и оставить");
console.error("    рядом комментарий, что она снята намеренно.");
console.error("  • Если дроп действительно нужен — заявить его явно:");
console.error("");
console.error(`      -- ${ALLOW_DROP_MARKER} <имя объекта> — причина`);
console.error("      DROP INDEX \"<имя объекта>\";");
console.error("");
console.error("  • И тогда же обновить реестр scripts/raw-sql-objects.mjs.");
process.exit(1);
