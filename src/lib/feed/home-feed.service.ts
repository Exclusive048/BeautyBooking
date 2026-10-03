import { prisma } from "@/lib/prisma";
import { decodeCursor, encodeCursor } from "@/lib/pagination/cursor";
import { encodePublicId } from "@/lib/public-id";
import {
  buildPortfolioSnapshot,
  collectMasterServicePairs,
  loadMasterServiceOverridesMap,
  publishedMasterWhere,
} from "@/lib/feed/portfolio.service";
import {
  decodeFeedPosition,
  encodeFeedPosition,
  groupByUploadWindow,
  pickGroupsForPage,
  type FeedWorkStamp,
  type UploadGroup,
} from "@/lib/feed/upload-window";

/**
 * HOME-FEED-COLLAGE — лента главной в виде коллажа: одна плитка = группа
 * загрузки одного автора (правило 48 часов — `upload-window.ts`). Отдельно от
 * `/api/feed/portfolio`, потому что тот читают ещё профиль мастера и карусель
 * студии, и форма их ответа — поштучные работы.
 *
 * Rule 12: наружу только непрозрачные id работ и `publicUsername` автора.
 */

export type HomeFeedWork = {
  id: string;
  mediaUrl: string;
  caption: string | null;
  /** Мастер студии, выполнивший работу (только у фото студии). */
  performerName: string | null;
  primaryServiceTitle: string | null;
  totalPrice: number;
};

export type HomeFeedGroup = {
  /** Непрозрачный ключ группы — для React и дедупликации на клиенте. */
  key: string;
  authorName: string;
  authorPublicUsername: string | null;
  authorRatingAvg: number;
  /** Автор уже в избранном у смотрящего (всегда false для гостя). */
  authorFavorited: boolean;
  /** Работы группы: свежие раньше. */
  works: HomeFeedWork[];
};

export type HomeFeedPage = {
  groups: HomeFeedGroup[];
  nextCursor: string | null;
};

/** MOBILE-B1: с городом (`?city=`) — только мастера города; без него — как было. */
function visibleWorkWhere(cityId?: string) {
  return { isPublic: true, ...publishedMasterWhere(cityId) };
}

/** Работ за один проход сканирования на одну запрошенную группу. */
const SCAN_ITEMS_PER_GROUP = 4;
/** Сколько проходов можно сделать, добирая страницу до `limit` групп. */
const MAX_SCAN_ROUNDS = 4;

function afterPositionWhere(position: { createdAt: Date; id: string } | null) {
  if (!position) return {};
  return {
    OR: [
      { createdAt: { lt: position.createdAt } },
      { createdAt: position.createdAt, id: { gt: position.id } },
    ],
  };
}

export async function listHomeFeedGroups(input: {
  limit: number;
  cursor?: string;
  currentUserId?: string;
  /** MOBILE-B1: только работы мастеров этого города (`City.id`). */
  cityId?: string;
}): Promise<HomeFeedPage> {
  const limit = Math.max(1, Math.min(30, input.limit));
  const decoded = input.cursor ? decodeCursor(input.cursor) : null;
  // Непонятный курсор — с начала ленты, как у соседней ленты с удалённым курсором.
  let position = decoded ? decodeFeedPosition(decoded) : null;

  const stamps = new Map<string, FeedWorkStamp>();
  const loadedAuthors = new Set<string>();
  const picked: UploadGroup[] = [];
  let hasMore = false;
  const batch = limit * SCAN_ITEMS_PER_GROUP;

  for (let round = 0; round < MAX_SCAN_ROUNDS; round += 1) {
    const rows = await prisma.portfolioItem.findMany({
      where: { ...visibleWorkWhere(input.cityId), ...afterPositionWhere(position) },
      select: { id: true, masterId: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: batch + 1,
    });
    const moreRows = rows.length > batch;
    const scanned: FeedWorkStamp[] = (moreRows ? rows.slice(0, batch) : rows).map((row) => ({
      id: row.id,
      authorId: row.masterId,
      createdAt: row.createdAt,
    }));
    if (scanned.length === 0) {
      hasMore = false;
      break;
    }

    // Граница группы якорится от самой ранней работы автора, поэтому нужна
    // вся его видимая история, а не только попавшее в проход.
    const newAuthors = [...new Set(scanned.map((work) => work.authorId))].filter(
      (authorId) => !loadedAuthors.has(authorId),
    );
    if (newAuthors.length > 0) {
      const history = await prisma.portfolioItem.findMany({
        where: { ...visibleWorkWhere(input.cityId), masterId: { in: newAuthors } },
        select: { id: true, masterId: true, createdAt: true },
      });
      for (const row of history) {
        stamps.set(row.id, { id: row.id, authorId: row.masterId, createdAt: row.createdAt });
      }
      for (const authorId of newAuthors) loadedAuthors.add(authorId);
    }
    for (const work of scanned) stamps.set(work.id, work);

    const groupOf = groupByUploadWindow([...stamps.values()]);
    const page = pickGroupsForPage({ scanned, groupOf, limit: limit - picked.length });
    picked.push(...page.groups);
    position = page.lastScanned ?? position;

    if (page.reachedLimit) {
      // Остаток прохода, где нет ни одной самой свежей работы группы, — это
      // старшие члены уже выведенных групп: следующая страница была бы пустой.
      const lastIndex = page.lastScanned ? scanned.indexOf(page.lastScanned) : -1;
      hasMore =
        moreRows ||
        scanned
          .slice(lastIndex + 1)
          .some((work) => groupOf.get(work.id)?.newestId === work.id);
      break;
    }
    if (!moreRows) {
      hasMore = false;
      break;
    }
    // Проход кончился, страница не набрана — следующий проход с новой позиции.
    hasMore = true;
  }

  const nextCursor = hasMore && position ? encodeCursor(encodeFeedPosition(position)) : null;
  if (picked.length === 0) return { groups: [], nextCursor };

  const memberIds = picked.flatMap((group) => group.memberIds);
  const authorIds = [...new Set(picked.map((group) => group.authorId))];

  const [rows, favorites] = await Promise.all([
    prisma.portfolioItem.findMany({
      where: { id: { in: memberIds } },
      select: {
        id: true,
        mediaUrl: true,
        caption: true,
        performerId: true,
        master: {
          select: { id: true, name: true, publicUsername: true, ratingAvg: true },
        },
        performer: { select: { name: true } },
        // include-ok: услуги одной работы — их единицы, выбираются при загрузке фото.
        services: {
          select: {
            service: {
              select: { id: true, name: true, title: true, price: true, durationMin: true },
            },
          },
        },
      },
    }),
    input.currentUserId
      ? prisma.userFavorite.findMany({
          where: { userId: input.currentUserId, providerId: { in: authorIds } },
          select: { providerId: true },
        })
      : Promise.resolve([]),
  ]);

  const overrides = await loadMasterServiceOverridesMap(collectMasterServicePairs(rows));
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const favoritedAuthors = new Set(favorites.map((favorite) => favorite.providerId));

  const groups: HomeFeedGroup[] = [];
  for (const group of picked) {
    const members = group.memberIds
      .map((id) => rowById.get(id))
      .filter((row): row is NonNullable<typeof row> => row !== undefined);
    const head = members[0];
    // Работу могли удалить между сканированием и чтением — группа без живых
    // работ просто не выводится.
    if (!head) continue;

    groups.push({
      key: encodePublicId(group.anchorId),
      authorName: head.master.name,
      authorPublicUsername: head.master.publicUsername ?? null,
      authorRatingAvg: head.master.ratingAvg,
      authorFavorited: favoritedAuthors.has(group.authorId),
      works: members.map((row) => {
        const snapshot = buildPortfolioSnapshot({
          masterId: row.performerId ?? row.master.id,
          services: row.services,
          overrides,
        });
        return {
          id: encodePublicId(row.id),
          mediaUrl: row.mediaUrl,
          caption: row.caption ?? null,
          performerName: row.performer?.name ?? null,
          primaryServiceTitle: snapshot.primaryServiceTitle,
          totalPrice: snapshot.totalPrice,
        } satisfies HomeFeedWork;
      }),
    });
  }

  return { groups, nextCursor };
}
