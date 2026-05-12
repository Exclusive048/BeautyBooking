import { ModelOfferStatus } from "@prisma/client";
import { prisma } from "./helpers/prisma";
import { logSeed } from "./helpers/log";
import type { SeededMaster } from "./seed-providers";

const OFFER_COUNT = 3;

export async function seedModelOffers(args: { masters: SeededMaster[] }): Promise<number> {
  logSeed.section("Model offers");
  let count = 0;

  for (let i = 0; i < OFFER_COUNT && i < args.masters.length; i++) {
    const master = args.masters[i]!;
    const service = await prisma.service.findFirst({
      where: { providerId: master.provider.id, isEnabled: true, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    if (!service) continue;

    // dateLocal as YYYY-MM-DD, tomorrow / +2 days / +3 days
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + i + 1);
    const dateLocal = date.toISOString().slice(0, 10);

    // Deterministic publicCode keeps re-runs idempotent (publicCode @unique).
    const publicCode = `seed-offer-${master.provider.publicUsername ?? master.provider.id.slice(-6)}-${i}`;

    await prisma.modelOffer.upsert({
      where: { publicCode },
      update: {
        status: ModelOfferStatus.ACTIVE,
        dateLocal,
        timeRangeStartLocal: "12:00",
        timeRangeEndLocal: "18:00",
        price: null,
      },
      create: {
        publicCode,
        masterId: master.provider.id,
        serviceId: service.id,
        dateLocal,
        timeRangeStartLocal: "12:00",
        timeRangeEndLocal: "18:00",
        status: ModelOfferStatus.ACTIVE,
        requirements: ["Открытость к экспериментам", "Готовность к фотосъёмке"],
      },
    });
    count++;
  }

  logSeed.ok(`${count} active model offers`);
  return count;
}
