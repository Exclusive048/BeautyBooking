/**
 * HOME-FEED-COLLAGE (решение владельца 2026-09-25) — работы одного автора
 * (мастера или студии), загруженные в пределах 48 часов, показываются на
 * главной ОДНОЙ плиткой-каруселью; работы, загруженные позже этого окна,
 * открывают новую карусель того же автора.
 *
 * Окно отсчитывается от ПЕРВОЙ работы группы, а не от предыдущей: при цепочке
 * «каждая следующая в 48 ч от предыдущей» мастер, выкладывающий по фото в день,
 * собрал бы одну бесконечную карусель. Следствие, на котором держится лента:
 * новая загрузка никогда не перекраивает уже сложившиеся группы — она либо
 * входит в последнюю группу автора, либо начинает новую.
 *
 * Группа попадает в ленту на месте своей САМОЙ СВЕЖЕЙ работы и приходит
 * целиком — поэтому страница пагинации её не разрывает: остальные члены
 * группы при последующем сканировании пропускаются (`pickGroupsForPage`).
 *
 * Модуль чистый (без БД и server-only) — правило одно и покрыто тестами;
 * ввод-вывод — в `home-feed.service.ts`.
 */

export const FEED_UPLOAD_WINDOW_HOURS = 48;

const FEED_UPLOAD_WINDOW_MS = FEED_UPLOAD_WINDOW_HOURS * 60 * 60 * 1000;

export type FeedWorkStamp = {
  id: string;
  /** Provider-автор работы (`PortfolioItem.masterId`): мастер ЛИБО студия. */
  authorId: string;
  createdAt: Date;
};

export type UploadGroup = {
  /** id первой (самой ранней) работы группы — стабилен, пока она жива. */
  anchorId: string;
  authorId: string;
  /** Члены группы в порядке ленты: свежие раньше. */
  memberIds: string[];
  /** Самая свежая работа — место группы в ленте. */
  newestId: string;
};

/**
 * Порядок ленты — ровно `ORDER BY createdAt DESC, id ASC` запроса. Держать
 * их одинаковыми обязательно: по нему решается, какая работа группы «самая
 * свежая», то есть где группа выводится.
 */
export function compareFeedOrder(a: FeedWorkStamp, b: FeedWorkStamp): number {
  const byTime = b.createdAt.getTime() - a.createdAt.getTime();
  if (byTime !== 0) return byTime;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * Разбивает работы на группы загрузки. На вход — ВСЯ видимая история каждого
 * автора, присутствующего во входе: окно якорится от самой ранней работы, и
 * без неё граница группы вышла бы другой.
 *
 * Возвращает группу для каждой работы (по id работы).
 */
export function groupByUploadWindow(stamps: FeedWorkStamp[]): Map<string, UploadGroup> {
  const byAuthor = new Map<string, FeedWorkStamp[]>();
  for (const stamp of stamps) {
    const list = byAuthor.get(stamp.authorId);
    if (list) list.push(stamp);
    else byAuthor.set(stamp.authorId, [stamp]);
  }

  const groupOf = new Map<string, UploadGroup>();
  for (const [authorId, works] of byAuthor) {
    // Хронологический порядок = обратный порядку ленты.
    const chronological = [...works].sort((a, b) => compareFeedOrder(b, a));
    let current: FeedWorkStamp[] = [];
    let windowStartMs = 0;

    const flush = () => {
      if (current.length === 0) return;
      const members = [...current].sort(compareFeedOrder);
      const group: UploadGroup = {
        anchorId: current[0]!.id,
        authorId,
        memberIds: members.map((member) => member.id),
        newestId: members[0]!.id,
      };
      for (const member of current) groupOf.set(member.id, group);
      current = [];
    };

    for (const work of chronological) {
      const at = work.createdAt.getTime();
      if (current.length > 0 && at - windowStartMs < FEED_UPLOAD_WINDOW_MS) {
        current.push(work);
        continue;
      }
      flush();
      current = [work];
      windowStartMs = at;
    }
    flush();
  }
  return groupOf;
}

/**
 * Выбор групп для страницы. `scanned` — работы потока ПОСЛЕ курсора в порядке
 * ленты. Группа выводится, когда сканирование доходит до её самой свежей
 * работы; более старые члены к этому моменту уже выведены вместе с ней и
 * пропускаются.
 *
 * `lastScanned` — новая позиция курсора: следующая страница продолжит поток
 * строго после неё.
 */
export function pickGroupsForPage(input: {
  scanned: FeedWorkStamp[];
  groupOf: Map<string, UploadGroup>;
  limit: number;
}): { groups: UploadGroup[]; lastScanned: FeedWorkStamp | null; reachedLimit: boolean } {
  const groups: UploadGroup[] = [];
  let lastScanned: FeedWorkStamp | null = null;
  for (const work of input.scanned) {
    lastScanned = work;
    const group = input.groupOf.get(work.id);
    if (group && group.newestId === work.id) {
      groups.push(group);
      if (groups.length >= input.limit) {
        return { groups, lastScanned, reachedLimit: true };
      }
    }
  }
  return { groups, lastScanned, reachedLimit: false };
}

/** Курсор ленты: позиция последней просканированной работы (время + id). */
export function encodeFeedPosition(work: Pick<FeedWorkStamp, "id" | "createdAt">): string {
  return `${work.createdAt.getTime()}:${work.id}`;
}

export function decodeFeedPosition(raw: string): { createdAt: Date; id: string } | null {
  const separator = raw.indexOf(":");
  if (separator <= 0) return null;
  const ms = Number(raw.slice(0, separator));
  const id = raw.slice(separator + 1);
  if (!Number.isSafeInteger(ms) || ms < 0 || id.length === 0) return null;
  return { createdAt: new Date(ms), id };
}
