import { prisma } from "@/lib/prisma";
import {
  CATALOG_PRESENCE_CONDITIONS,
  type CatalogPresenceGap,
} from "@/lib/providers/catalog-visibility";

export type { CatalogPresenceGap };

export type CatalogPresence = {
  /** Провайдера находят в каталоге и поиске (`catalogVisibleProviderWhere`). */
  listed: boolean;
  /** Каких условий не хватает — в порядке, в котором их стоит закрывать. */
  gaps: CatalogPresenceGap[];
};

const GAP_ORDER: readonly CatalogPresenceGap[] = ["hidden", "address", "schedule"];

/**
 * VISIBILITY-CATALOG-STATUS (2026-09-23) — есть ли кабинет в каталоге и чего
 * не хватает. До этого кабинет показывал только ЖЕЛАНИЕ («Опубликован»), и
 * мастер без адреса или расписания видел «Опубликован», а в каталоге его не
 * было.
 *
 * Условия берутся из `CATALOG_PRESENCE_CONDITIONS` — из них же собран предикат
 * каталога, поэтому «в каталоге» здесь и в выдаче не могут разойтись:
 * `listed` — это конъюнкция тех же условий, что и предикат. Один запрос на
 * условие — это кабинет, не горячий путь.
 */
export async function resolveCatalogPresence(providerId: string): Promise<CatalogPresence | null> {
  const [exists, ...met] = await Promise.all([
    prisma.provider.count({ where: { id: providerId } }),
    ...GAP_ORDER.map((gap) =>
      prisma.provider.count({ where: { id: providerId, ...CATALOG_PRESENCE_CONDITIONS[gap] } }),
    ),
  ]);
  if (exists === 0) return null;
  const gaps = GAP_ORDER.filter((_, index) => met[index] === 0);
  return { listed: gaps.length === 0, gaps };
}
