/**
 * SEED-DEFUSE-01 — единый production-гард для сид-энтрипойнтов, которые
 * создают ФИКСТУРНЫЕ данные (`seed:test`) или удаляют их (`seed:test:reset`).
 *
 * Почему гард обязателен именно на сидинге, а не только на reset: фикстуры —
 * это не безобидный мусор, а рабочие аккаунты. `+7 999 x00 00 00` с ролями
 * MASTER / STUDIO / **ADMIN** и предсказуемым OTP-флоу в живой базе — это
 * доступ, а не строки. Поэтому отказ обязан случиться ДО первой записи
 * (структурно пиннится в `guard.test.ts`), а не после половины прогона.
 *
 * Что гард НЕ покрывает — осознанно: справочные сидеры `seed:plans` /
 * `seed:billing` (MASTER_FREE + STUDIO_FREE — их читает прод-рантайм:
 * `ensure-free-subscription.ts`, `get-current-plan.ts`), `seed:review-tags`
 * и `scripts/seed-visual-categories.ts` наполняют продуктовые СПРАВОЧНИКИ,
 * а не фикстуры: логинящихся аккаунтов они не создают, и в проде их прогон
 * легитимен, а для free-плана обязателен. Закрыть их тем же флагом значило
 * бы сломать провижининг ради формальной симметрии.
 *
 * `process.env` читается напрямую (а не через `src/lib/env.ts`) намеренно:
 * сид — самостоятельный процесс вне Next-рантайма, а `env.ts` валидирует
 * ~78 переменных (включая обязательные секреты) и уронил бы сид на машине,
 * где задан один `DATABASE_URL`. Тот же приём уже жил в `test-data/*` — здесь
 * он только сведён в одно место.
 */

/** Env-срез, от которого зависит решение. Явный тип — чтобы предикат был чистым и тестируемым. */
export type SeedGuardEnv = {
  NODE_ENV?: string | undefined;
  ALLOW_TEST_SEED?: string | undefined;
};

/**
 * Явные «да». Прежняя проверка была `!process.env.ALLOW_TEST_SEED`, то есть
 * ЛЮБАЯ непустая строка открывала гейт — включая `ALLOW_TEST_SEED=false`,
 * который человек пишет ровно с обратным намерением. Сужение (не ослабление):
 * всё, что не перечислено здесь, теперь трактуется как «нет».
 */
const AFFIRMATIVE = new Set(["true", "1", "yes", "on"]);

/** Разрешён ли прогон фикстурного сида в этом окружении. Чистая функция. */
export function isSeedAllowed(env: SeedGuardEnv): boolean {
  if (env.NODE_ENV !== "production") return true;
  return AFFIRMATIVE.has(String(env.ALLOW_TEST_SEED ?? "").trim().toLowerCase());
}

/** Сообщение отказа. Отдельно от `process.exit`, чтобы его можно было проверить. */
export function seedRefusalMessage(label: string): string {
  return (
    `⚠ ${label} запрещён в production.\n` +
    "  Фикстурные аккаунты (+7999…) с предсказуемым входом и ролью ADMIN в живой\n" +
    "  базе — это доступ, а не тестовые данные.\n" +
    "  Осознанный прогон: ALLOW_TEST_SEED=true (принимаются также 1 / yes / on)."
  );
}

/**
 * Вызывать ПЕРВОЙ строкой `main()` — до любого обращения к `prisma`.
 * Порядок пиннится структурным тестом, а не соглашением.
 */
export function assertSeedAllowed(label: string): void {
  if (isSeedAllowed(process.env)) return;
  console.error(seedRefusalMessage(label));
  process.exit(1);
}
