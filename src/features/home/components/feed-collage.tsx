"use client";

import { useMemo, useState } from "react";
import { FeedGroupTile } from "@/features/home/components/feed-group-tile";
import {
  COLLAGE_COLUMN_CLASS,
  COLLAGE_ROW_CLASS,
  collageRatioFor,
  placeInColumns,
} from "@/features/home/lib/collage-layout";
import type { HomeFeedGroup } from "@/lib/feed/home-feed.service";
import { useMediaQuery } from "@/hooks/use-media-query";

/**
 * Число колонок: 3 на телефоне и планшете, 6 на ПК — плотность сетки, которую
 * владелец выбрал для ленты (HOME-FEED-DENSE), коллаж её сохраняет.
 */
export function useCollageColumns(): number {
  return useMediaQuery("(min-width: 1024px)") ? 6 : 3;
}

type Props = {
  groups: HomeFeedGroup[];
  columns: number;
  isAuthenticated: boolean;
};

/**
 * HOME-FEED-COLLAGE — лента главной коллажем. Раскладка — `placeInColumns`
 * (каждая плитка в самую короткую колонку), поэтому догрузка добавляет плитки
 * снизу и не двигает показанные.
 *
 * Отметка «в избранном» — по АВТОРУ, а у автора в ленте может быть несколько
 * плиток: состояние держится здесь, чтобы нажатие на одной плитке меняло все.
 */
export function FeedCollage({ groups, columns, isAuthenticated }: Props) {
  const [favoriteByAuthor, setFavoriteByAuthor] = useState<Record<string, boolean>>({});

  const placed = useMemo(
    () => placeInColumns(groups, columns, (group) => collageRatioFor(group.key)),
    [groups, columns],
  );

  return (
    <div className={COLLAGE_ROW_CLASS}>
      {placed.map((column, columnIndex) => (
        <div key={columnIndex} className={COLLAGE_COLUMN_CLASS}>
          {column.map(({ item: group, index }) => {
            const author = group.authorPublicUsername;
            const favorited =
              (author ? favoriteByAuthor[author] : undefined) ?? group.authorFavorited;
            return (
              <FeedGroupTile
                key={group.key}
                group={group}
                ratio={collageRatioFor(group.key)}
                priority={index < columns}
                isAuthenticated={isAuthenticated}
                favorited={favorited}
                onFavoritedChange={(next) => {
                  if (!author) return;
                  setFavoriteByAuthor((prev) => ({ ...prev, [author]: next }));
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
