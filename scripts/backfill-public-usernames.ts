import { PrismaClient, ProviderType } from "@prisma/client";
import { ensureUniqueUsername, slugifyUsername } from "../src/lib/publicUsername";

const prisma = new PrismaClient();

const TRANSLIT_MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ы: "y",
  э: "e",
  ю: "yu",
  я: "ya",
  ь: "",
  ъ: "",
};

function transliterate(value: string): string {
  const lower = value.trim().toLowerCase();
  let result = "";
  for (const char of lower) {
    if (TRANSLIT_MAP[char] !== undefined) {
      result += TRANSLIT_MAP[char];
      continue;
    }
    result += char;
  }
  return result;
}

function buildBaseSlug(name: string): string {
  const translit = transliterate(name);
  return slugifyUsername(translit);
}

function fallbackPrefix(type: ProviderType): string {
  return type === ProviderType.STUDIO ? "studio" : "master";
}

async function backfillProviders() {
  const providers = await prisma.provider.findMany({
    where: { isPublished: true, publicUsername: null },
    select: { id: true, name: true, type: true },
  });

  for (const provider of providers) {
    const suffix = provider.id.slice(0, 4);
    const base = buildBaseSlug(provider.name);
    const candidate = base ? `${base}-${suffix}` : `${fallbackPrefix(provider.type)}-${suffix}`;
    const unique = await ensureUniqueUsername(prisma, candidate);
    await prisma.provider.update({
      where: { id: provider.id },
      data: { publicUsername: unique, publicUsernameUpdatedAt: new Date() },
    });
    console.info("[backfill-public-usernames] provider", {
      id: provider.id,
      username: unique,
    });
  }
}

async function main() {
  await backfillProviders();
}

main()
  .catch((error) => {
    console.error("[backfill-public-usernames] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
