import { prisma } from "@/lib/prisma";
import { REVIEW_BADGE_THRESHOLD } from "@/lib/reviews/constants";

export type SuperpowerBadgeDto = {
  code: string;
  title: string;
  subtitle: string;
  icon: string;
  count: number;
};

type BadgeConfig = {
  title: string;
  subtitle: string;
  icon: string;
};

const BADGE_BY_TAG_CODE: Record<string, BadgeConfig> = {
  STERILE: { title: "Стерильно на 100%", subtitle: "Ревизорро", icon: "💎" },
  FAST: { title: "Турбо-мастер", subtitle: "Флэш", icon: "⚡️" },
  PLEASANT_SILENCE: { title: "Дзен-мастер", subtitle: "Silent Mode", icon: "🤫" },
};

const BADGE_TAG_CODES = Object.keys(BADGE_BY_TAG_CODE);

export async function getProviderSuperpowerBadges(providerId: string): Promise<SuperpowerBadgeDto[]> {
  const grouped = await prisma.reviewTagOnReview.groupBy({
    by: ["tagId"],
    where: {
      review: {
        targetType: "provider",
        targetId: providerId,
      },
      tag: {
        type: "PUBLIC",
        code: { in: BADGE_TAG_CODES },
      },
    },
    _count: { _all: true },
  });

  if (grouped.length === 0) return [];

  const tags = await prisma.reviewTag.findMany({
    where: {
      id: { in: grouped.map((row) => row.tagId) },
    },
    select: { id: true, code: true },
  });

  const codeByTagId = new Map(tags.map((tag) => [tag.id, tag.code] as const));
  const badges: SuperpowerBadgeDto[] = [];

  for (const row of grouped) {
    const code = codeByTagId.get(row.tagId);
    if (!code) continue;
    const config = BADGE_BY_TAG_CODE[code];
    if (!config) continue;
    const count = row._count._all;
    if (count < REVIEW_BADGE_THRESHOLD) continue;
    badges.push({
      code,
      title: config.title,
      subtitle: config.subtitle,
      icon: config.icon,
      count,
    });
  }

  return badges.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
}
