/**
 * Сброс `process.env` в тестах env-модуля без порчи окружения самого процесса.
 *
 * Тесты `env.ts` перечитывают модуль на «чистом» окружении: удаляют все
 * переменные и ставят набор кейса. Удалять ВСЁ нельзя: `delete process.env[k]`
 * зовёт `unsetenv` у настоящего окружения процесса, а им пользуется не только
 * JavaScript. На Windows OpenSSL 3.5 (Node 26) при первой выдаче случайных байт
 * ищет системные библиотеки через `SystemRoot`; без неё `randomUUID()` падает с
 * «entropy source strength too weak» — и тест обработчика роута (он берёт
 * request-id из `randomUUID`) краснеет не по своей причине. На Node 20 то же
 * удаление проходило молча только потому, что ГСЧ был инициализирован раньше.
 *
 * Поэтому переменные ОС сохраняются: их не читает `env.ts` (Zod-схема
 * описывает только переменные приложения и лишние ключи игнорирует), а без
 * них ломается рантайм. Список — переменные, без которых процесс Windows /
 * Unix перестаёт находить системные каталоги, временную папку и исполняемые
 * файлы.
 */

const OS_ENV_KEYS: readonly string[] = [
  "SystemRoot",
  "SYSTEMROOT",
  "windir",
  "WINDIR",
  "SystemDrive",
  "ComSpec",
  "PATHEXT",
  "PATH",
  "Path",
  "TEMP",
  "TMP",
  "TMPDIR",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "ProgramData",
  "ProgramFiles",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
];

const OS_ENV_KEY_SET = new Set(OS_ENV_KEYS.map((key) => key.toUpperCase()));

/** Переменная окружения ОС, которую сброс оставляет на месте. */
export function isOsEnvKey(key: string): boolean {
  return OS_ENV_KEY_SET.has(key.toUpperCase());
}

/**
 * Удаляет из `process.env` все переменные, кроме переменных ОС, и ставит
 * `next`. Значение `undefined` в `next` — «переменной нет».
 */
export function resetProcessEnv(next: Record<string, string | undefined> = {}): void {
  for (const key of Object.keys(process.env)) {
    if (!isOsEnvKey(key)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
