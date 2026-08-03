#!/usr/bin/env node
/**
 * SCHEMA-DRIFT-CI-CHECK (MIGRATION-RECONCILIATION-BATCH 2026-05-30) — structural prevention
 * for the `db push` anti-pattern that caused the May 2026 24-operation sprint-long drift.
 *
 * Why this exists
 * ───────────────
 * `prisma db push` syncs schema.prisma → DB without creating a migration file. Over a sprint
 * the project accumulated 24 schema operations (1 enum value + 6 ALTER TABLE + 4 CREATE TABLE
 * + 13 indexes) that lived in schema.prisma + the generated client + the dev DB, but had no
 * corresponding migration file. Production deploy would have run `prisma migrate deploy`
 * cleanly (applying only the recorded migrations) and the app would have crashed at runtime
 * on first access to any drifted column.
 *
 * This gate catches the class structurally. It runs `prisma migrate diff` comparing the
 * migrations history against the current schema.prisma; any non-empty diff = drift = CI fail.
 *
 * Mechanism
 * ─────────
 * GATES-FIX-01 (2026-08-03) — фильтр фантомного дрейфа
 * ────────────────────────────────────────────────────
 * Гейт краснел НА ЧИСТОМ HEAD с 2026-07-13: pgvector-индекс `hnsw` живёт в
 * сыром SQL (Prisma не умеет тип `Hnsw`, см. scripts/raw-sql-objects.mjs), и
 * diff видел его как «лишний» объект. Всегда-красный гейт — это выключенный
 * гейт: два месяца отчёты писали «✅» рядом с фактическим ❌.
 *
 * Поэтому теперь diff берётся в форме SQL (`--script`), из него выбрасываются
 * statement'ы, относящиеся к объектам из явного реестра, и дрейфом считается
 * только ОСТАТОК. Реестр — короткий список ТОЧНЫХ имён, не паттернов.
 *
 * Что этот фильтр НЕ покрывает: `migrate dev` всё равно продолжит дописывать
 * `DROP INDEX` в новые миграции — это ловится вторым гейтом
 * `check:migration-drops` (scripts/check-migration-drops.mjs).
 *
 * `npx prisma migrate diff --from-migrations <dir> --to-schema-datamodel <dir> --exit-code`
 *   • exit 0 → no drift (schema matches what migrations would produce)
 *   • exit 2 → drift detected (one or more SQL ops would be needed to align)
 *   • exit 1 → tool failure (missing shadow DB, schema parse error, etc)
 *
 * The diff requires a shadow database URL so Prisma can spin up a scratch DB to run
 * the diff against. Defaults to the local Docker Postgres maintenance DB; CI overrides
 * via SHADOW_DATABASE_URL if a different Postgres is available.
 *
 * Local dev fallback: if Postgres is unreachable, skip with a non-blocking WARNING.
 * CI sets CI=true (default for GitHub Actions); in that mode we treat unreachable
 * Postgres as a hard failure (the CI environment is expected to provide it).
 */

import { execSync } from "node:child_process";
import { RAW_SQL_OBJECTS, matchesRawSqlObject } from "./raw-sql-objects.mjs";

const SHADOW_URL =
  process.env.SHADOW_DATABASE_URL ||
  "postgresql://master:master123@localhost:5432/postgres";

const IS_CI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

function runDiff() {
  return execSync(
    `npx prisma migrate diff --from-migrations prisma/schema/migrations --to-schema-datamodel prisma/schema --shadow-database-url "${SHADOW_URL}" --exit-code`,
    { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }
  );
}

/** Тот же diff, но в виде SQL — единственная форма, которую можно надёжно фильтровать. */
function runDiffScript() {
  return execSync(
    `npx prisma migrate diff --from-migrations prisma/schema/migrations --to-schema-datamodel prisma/schema --shadow-database-url "${SHADOW_URL}" --script`,
    { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }
  );
}

/**
 * Режет SQL на statement'ы и делит их на «объяснимые реестром» и «настоящий
 * дрейф». Комментарии (`-- CreateIndex` и пр.) сами по себе statement'ами не
 * считаются — они приклеиваются к следующему.
 */
function classifyDriftSql(sql) {
  const statements = sql
    .split(";")
    .map((chunk) =>
      chunk
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter((chunk) => chunk.length > 0);

  const explained = [];
  const real = [];
  for (const statement of statements) {
    const match = matchesRawSqlObject(statement);
    if (match) explained.push({ statement, object: match });
    else real.push(statement);
  }
  return { explained, real };
}

try {
  runDiff();
  console.log(
    "SCHEMA-DRIFT: OK — schema.prisma matches migrations history (0 drift)."
  );
  process.exit(0);
} catch (error) {
  // Prisma migrate diff --exit-code semantics:
  //   2 = differences exist
  //   1 = tool/connection error
  const code = error.status;
  const stderr = (error.stderr || "").toString();
  const stdout = (error.stdout || "").toString();

  if (code === 2) {
    // GATES-FIX-01: прежде чем кричать — выяснить, весь ли дрейф объясняется
    // реестром сырых SQL-объектов. Если да, настоящего дрейфа нет.
    let classified = null;
    try {
      classified = classifyDriftSql(runDiffScript());
    } catch {
      // Не смогли получить SQL-форму — падаем по-старому, на полном диффе.
    }

    if (classified && classified.real.length === 0 && classified.explained.length > 0) {
      console.log(
        "SCHEMA-DRIFT: OK — расхождений нет; весь дифф объясняется объектами, которые существуют только в сыром SQL:"
      );
      for (const { object } of classified.explained) {
        console.log(`  • ${object.name} (${object.table}) — ${object.why}`);
        console.log(`    источник: ${object.migration}`);
      }
      console.log(
        `  Реестр: scripts/raw-sql-objects.mjs (${RAW_SQL_OBJECTS.length} объект(ов), точные имена).`
      );
      console.log(
        "  Дроп такого объекта в новой миграции ловит отдельный гейт: npm run check:migration-drops"
      );
      process.exit(0);
    }

    console.error("");
    console.error("🚨 SCHEMA DRIFT DETECTED");
    if (classified && classified.explained.length > 0) {
      console.error("");
      console.error(
        `(${classified.explained.length} statement(s) объяснены реестром сырых SQL-объектов и НЕ учитывались; ниже — настоящий дрейф.)`
      );
    }
    console.error("");
    console.error(
      "schema.prisma diverges from migrations history. This typically means"
    );
    console.error(
      "`prisma db push` was used to apply a schema change, OR schema was edited"
    );
    console.error("without running `prisma migrate dev` to record the change.");
    console.error("");
    console.error("Why this matters:");
    console.error(
      "  • Production deploy applies migrations only — drift = runtime crash"
    );
    console.error(
      "  • See MIGRATION-RECONCILIATION-BATCH (2026-05-30) for the precedent"
    );
    console.error("");
    console.error("Recovery:");
    console.error(
      "  1. View the drift:  npx prisma migrate diff --from-migrations prisma/schema/migrations --to-schema-datamodel prisma/schema --shadow-database-url '<url>' --script"
    );
    console.error("  2. Review the generated SQL carefully (NO DROPs expected)");
    console.error(
      "  3. Create a migration:  manually scaffold under prisma/schema/migrations/<timestamp>_descriptive_name/migration.sql"
    );
    console.error(
      "  4. Apply:  npx prisma migrate deploy   (then commit the migration file)"
    );
    console.error("");
    console.error(
      "Rule: `prisma db push` is FORBIDDEN in this repo. See CLAUDE.md § ВАЖНЫЕ ПРАВИЛА #16."
    );
    if (stdout) {
      console.error("");
      console.error("Diff output:");
      console.error(stdout);
    }
    process.exit(1);
  }

  // Postgres unreachable / shadow DB issue
  const isUnreachable =
    /ECONNREFUSED|getaddrinfo|connect ECONNREFUSED|could not connect|P1001/.test(
      stderr + stdout
    );

  if (isUnreachable) {
    if (IS_CI) {
      console.error(
        "❌ SCHEMA-DRIFT: shadow Postgres unreachable in CI environment."
      );
      console.error(
        "Set SHADOW_DATABASE_URL to a reachable Postgres maintenance DB."
      );
      console.error("");
      console.error(stderr || "(no stderr)");
      process.exit(1);
    }
    console.warn(
      "⚠️  SCHEMA-DRIFT: shadow Postgres unreachable locally — skipping check."
    );
    console.warn(
      "   (Start the local DB: `docker start masterryadom-db`, then re-run.)"
    );
    process.exit(0);
  }

  console.error("❌ SCHEMA-DRIFT: unexpected error running prisma migrate diff");
  console.error("");
  console.error(stderr || stdout || error.message);
  process.exit(1);
}
