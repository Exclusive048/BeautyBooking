import { timingSafeStringEqual } from "@/lib/auth/constant-time";

/**
 * SEC-21 — единая аутентификация cron-эндпоинтов.
 *
 * Три роута (`billing/renew/run`, `billing/mrr/snapshot/run`,
 * `catalog/available-today/run`) несли одинаковую копию `getCronToken`, которая
 * читала секрет из заголовка `x-cron-token`, а при его отсутствии — из
 * `?token=`. Query-строка попадает в access-логи балансировщика, в реферер и в
 * историю браузера, то есть секрет утекал бы в места, которые никто не считает
 * хранилищем секретов. Заголовок поддерживался и раньше — query-ветка была
 * удобством, а не необходимостью, и удалена.
 *
 * Ноль вызывающих в проде на момент правки: планировщик ещё не заведён (`crontab`
 * в репозитории нет, см. `DEPLOY-BACKLOG.md`) — тот, кто будет его заводить,
 * обязан использовать заголовок.
 *
 * Отсутствие секрета в env = отказ (fail-closed): cron-эндпоинт никогда не
 * выполняется неаутентифицированным. Сравнение — общий constant-time-хелпер,
 * который хеширует обе стороны и потому не зависит от длины (SEC-20).
 *
 * Вебхук ЮКассы намеренно НЕ переводится на эту функцию: там `?token=` — это
 * URL, прописанный в личном кабинете платёжного провайдера, и он не наш выбор
 * (см. `DEPLOY-BACKLOG.md`; якорь подлинности всё равно другой — инв. #5).
 */
export const CRON_TOKEN_HEADER = "x-cron-token";

export function isAuthorizedCronRequest(
  req: Request,
  expectedSecret: string | undefined | null,
): boolean {
  const expected = expectedSecret?.trim();
  if (!expected) return false;

  const provided = req.headers.get(CRON_TOKEN_HEADER)?.trim();
  if (!provided) return false;

  return timingSafeStringEqual(provided, expected);
}
