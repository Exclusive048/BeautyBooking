import { DiscountType } from "@prisma/client";
import { prisma } from "./helpers/prisma";
import { logSeed } from "./helpers/log";
import { createRng } from "./helpers/deterministic-rng";
import type { SeededMaster } from "./seed-providers";

const HOT_COUNT = 4;

export async function seedHotSlots(args: { masters: SeededMaster[] }): Promise<number> {
  logSeed.section("Hot slots");
  const rng = createRng("hot-slots-v1");
  let count = 0;

  // One slot per first N distinct masters — keeps `(providerId,start,end)`
  // unique constraint happy across re-runs even if `now()` shifts.
  for (let i = 0; i < HOT_COUNT && i < args.masters.length; i++) {
    const master = args.masters[i]!;
    const service = await prisma.service.findFirst({
      where: { providerId: master.provider.id, isEnabled: true, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    if (!service) continue;

    // Slot today evening or tomorrow afternoon — deterministic via `i`.
    const startAt = new Date();
    startAt.setUTCHours(0, 0, 0, 0);
    startAt.setUTCDate(startAt.getUTCDate() + (i % 2));
    startAt.setUTCHours(15 + i, 0, 0, 0);
    const endAt = new Date(startAt.getTime() + service.durationMin * 60_000);
    const expiresAt = new Date(startAt.getTime() - 60 * 60_000); // expires 1h before slot

    const discountValue = rng.int(15, 30);

    await prisma.hotSlot.upsert({
      where: {
        providerId_startAtUtc_endAtUtc: {
          providerId: master.provider.id,
          startAtUtc: startAt,
          endAtUtc: endAt,
        },
      },
      update: {
        serviceId: service.id,
        discountValue,
        expiresAtUtc: expiresAt,
        isActive: true,
      },
      create: {
        providerId: master.provider.id,
        serviceId: service.id,
        startAtUtc: startAt,
        endAtUtc: endAt,
        discountType: DiscountType.PERCENT,
        discountValue,
        expiresAtUtc: expiresAt,
        isActive: true,
        isAuto: false,
        reason: "seed",
      },
    });
    count++;
  }

  logSeed.ok(`${count} hot slots active`);
  return count;
}
