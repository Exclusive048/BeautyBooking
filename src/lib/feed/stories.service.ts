import { prisma } from "@/lib/prisma";

export type StoryMaster = {
  masterId: string;
  masterName: string;
  masterAvatarUrl: string | null;
  masterPublicUsername: string | null;
  category: string | null;
  photos: StoryPhoto[];
};

export type StoryPhoto = {
  id: string;
  mediaUrl: string;
  caption: string | null;
  width: number | null;
  height: number | null;
  serviceName: string | null;
  price: number | null;
};

const MAX_MASTERS = 15;
const PHOTOS_PER_MASTER = 5;
const LOOKBACK_DAYS = 30;

export async function listStoriesMasters(): Promise<StoryMaster[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

  const recentItems = await prisma.portfolioItem.findMany({
    where: {
      isPublic: true,
      createdAt: { gte: cutoff },
      master: { isPublished: true, type: "MASTER" },
    },
    include: {
      master: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          publicUsername: true,
        },
      },
      services: {
        take: 1,
        include: {
          service: {
            select: {
              name: true,
              title: true,
              price: true,
              globalCategory: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_MASTERS * PHOTOS_PER_MASTER * 2,
  });

  const masterMap = new Map<string, StoryMaster>();

  for (const item of recentItems) {
    let master = masterMap.get(item.masterId);
    if (!master) {
      if (masterMap.size >= MAX_MASTERS) continue;

      const svc = item.services[0]?.service ?? null;
      master = {
        masterId: item.master.id,
        masterName: item.master.name,
        masterAvatarUrl: item.master.avatarUrl,
        masterPublicUsername: item.master.publicUsername,
        category: svc?.globalCategory?.name ?? null,
        photos: [],
      };
      masterMap.set(item.masterId, master);
    }

    if (master.photos.length >= PHOTOS_PER_MASTER) continue;

    const svc = item.services[0]?.service ?? null;
    master.photos.push({
      id: item.id,
      mediaUrl: item.mediaUrl,
      caption: item.caption,
      width: item.width,
      height: item.height,
      serviceName: svc?.title?.trim() || svc?.name || null,
      price: svc?.price ?? null,
    });
  }

  return Array.from(masterMap.values()).filter((m) => m.photos.length > 0);
}
