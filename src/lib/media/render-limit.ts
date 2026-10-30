/**
 * MEDIA-RENDER-DEDUP (2026-10-30) — общий на процесс предел одновременных
 * рендеров sharp при ОТДАЧЕ фото: вырез `crop/[v]` и превью `?w=`.
 *
 * ## Зачем
 *
 * sharp выполняет каждую операцию (`metadata`, `toBuffer`) на пуле потоков
 * libuv — по умолчанию их четыре на процесс (`UV_THREADPOOL_SIZE` не задан).
 * На том же пуле живут `dns.lookup` исходящих запросов (хранилище, Яндекс),
 * `crypto.pbkdf2`/`scrypt`, `zlib` и `fs`. Холодная лента или каталог —
 * десятки разных вырезов и превью одновременно — занимали все четыре потока,
 * и в контейнере `api` вставали остальные операции на пуле (A-05, E-02).
 * Предел 2 оставляет половину пула прочим.
 *
 * ## Почему семафор, а не `sharp.concurrency()`
 *
 * `sharp.concurrency(n)` задаёт число потоков libvips ВНУТРИ одной операции, а
 * не число одновременных операций: десять запросов по-прежнему заняли бы пул
 * десятью задачами. Ограничивать надо число операций — это делает очередь
 * здесь. `UV_THREADPOOL_SIZE` в образе — отдельное ops-решение (он увеличил бы
 * пул, но не убрал бы конкуренцию).
 *
 * ## Что под пределом, а что нет
 *
 * Под пределом — только сам рендер; чтение исходника из хранилища идёт до
 * слота: это сетевой ввод-вывод, и держать слот на время ответа хранилища
 * значило бы простаивать. Ожидающие слот держат исходник в памяти; их число
 * ограничено дедупликацией одинаковых запросов (вырез и превью — по ключу) и
 * тиром прокси `mediaRead`. Загрузки (`readValidatedImageUpload`) под предел
 * не попадают: их единицы, они пользовательское действие со своим лимитом, и
 * ожидание за чужой лентой сделало бы загрузку медленнее без пользы.
 *
 * Слоты передаются по очереди (FIFO): освобождающий отдаёт свой слот
 * следующему ожидающему, а не уменьшает счётчик, — иначе новый запрос мог бы
 * проскочить вперёд ждущего.
 *
 * Экземпляр хранится на `globalThis` (как клиент Prisma и Redis): предел
 * обязан быть одним на процесс — общим для обоих роутов — сколько бы раз ни
 * вычислялся сам модуль (перезагрузка в dev, разные точки входа сборки).
 */

export type RenderLimiterStats = { active: number; waiting: number };

export type RenderLimiter = {
  run<T>(task: () => Promise<T>): Promise<T>;
  stats(): RenderLimiterStats;
};

export function createRenderLimiter(limit: number): RenderLimiter {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`Render limit must be a positive integer, got ${limit}`);
  }
  let active = 0;
  const waiting: Array<() => void> = [];

  function acquire(): Promise<void> {
    if (active < limit) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => waiting.push(resolve));
  }

  function release(): void {
    const next = waiting.shift();
    // Слот переходит следующему как есть: счётчик не меняется.
    if (next) next();
    else active -= 1;
  }

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
    stats: () => ({ active, waiting: waiting.length }),
  };
}

/** Одновременных рендеров sharp на процесс: половина пула libuv по умолчанию. */
export const MEDIA_RENDER_CONCURRENCY = 2;

const globalForRender = globalThis as typeof globalThis & {
  __mediaRenderLimiter?: RenderLimiter;
};

function mediaRenderLimiter(): RenderLimiter {
  globalForRender.__mediaRenderLimiter ??= createRenderLimiter(MEDIA_RENDER_CONCURRENCY);
  return globalForRender.__mediaRenderLimiter;
}

/** Выполнить рендер в общем слоте (вырез и превью делят один предел). */
export function withMediaRenderSlot<T>(task: () => Promise<T>): Promise<T> {
  return mediaRenderLimiter().run(task);
}

/** Состояние общего предела — для тестов и диагностики. */
export function mediaRenderStats(): RenderLimiterStats {
  return mediaRenderLimiter().stats();
}
