import type { UserProfile } from "@prisma/client";
import { prisma } from "./helpers/prisma";
import { logSeed } from "./helpers/log";
import { createRng } from "./helpers/deterministic-rng";
import type { SeededMaster, SeededStudio } from "./seed-providers";

const FAV_CLIENT_COUNT = 5;

/**
 * Hand 5 of our seed clients a small set of favorited masters/studios so the
 * /cabinet/favorites page (22b) and the catalog heart filled-state both
 * have something to show. Idempotent via the `(userId, providerId)` unique.
 */
export async function seedFavorites(args: {
  clients: UserProfile[];
  masters: SeededMaster[];
  studios: SeededStudio[];
}): Promise<number> {
  logSeed.section("Favorites");
  const rng = createRng("favorites-v1");
  const targets = [
    ...args.masters.map((m) => m.provider.id),
    ...args.studios.map((s) => s.provider.id),
  ];
  if (targets.length === 0 || args.clients.length === 0) return 0;

  let count = 0;
  for (let i = 0; i < FAV_CLIENT_COUNT && i < args.clients.length; i++) {
    const client = args.clients[i]!;
    const favCount = rng.int(1, 3);
    const picks = rng.shuffle(targets).slice(0, favCount);
    for (const providerId of picks) {
      await prisma.userFavorite.upsert({
        where: { userId_providerId: { userId: client.id, providerId } },
        update: {},
        create: { userId: client.id, providerId },
      });
      count++;
    }
  }
  logSeed.ok(`${count} favorites across ${FAV_CLIENT_COUNT} clients`);
  return count;
}
