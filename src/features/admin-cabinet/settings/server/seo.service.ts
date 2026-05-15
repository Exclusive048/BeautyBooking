import { prisma } from "@/lib/prisma";
import type { SeoValues } from "@/features/admin-cabinet/settings/types";

const SEO_KEYS = {
  seoTitle: "siteSeoTitle",
  seoDescription: "siteSeoDescription",
} as const;

export async function getSeoValues(): Promise<SeoValues> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [SEO_KEYS.seoTitle, SEO_KEYS.seoDescription] } },
    select: { key: true, value: true },
  });

  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  return {
    seoTitle: byKey.get(SEO_KEYS.seoTitle) ?? "",
    seoDescription: byKey.get(SEO_KEYS.seoDescription) ?? "",
  };
}
