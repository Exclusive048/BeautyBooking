/**
 * Seeds ReviewTag records (public positive + private improvement tags).
 * Safe to run multiple times — uses upsert by code.
 *
 * Usage:
 *   npx tsx scripts/seed-review-tags.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TAGS = [
  // ── Public: positive ────────────────────────────────────────────────────────
  { code: "QUALITY",       label: "Качество работы",     icon: "⭐",  type: "PUBLIC",  category: "positive" },
  { code: "FAST",          label: "Быстро",               icon: "⚡️", type: "PUBLIC",  category: "positive" },
  { code: "STERILE",       label: "Стерильно",            icon: "💎",  type: "PUBLIC",  category: "positive" },
  { code: "COMMUNICATION", label: "Приятное общение",     icon: "💬",  type: "PUBLIC",  category: "positive" },
  { code: "PUNCTUALITY",   label: "Пунктуальность",       icon: "⏰",  type: "PUBLIC",  category: "positive" },
  { code: "ATMOSPHERE",    label: "Атмосфера",            icon: "💆",  type: "PUBLIC",  category: "positive" },
  { code: "DESIGN",        label: "Дизайн",               icon: "🎨",  type: "PUBLIC",  category: "positive" },
  { code: "PLEASANT_SILENCE", label: "Приятное молчание", icon: "🤫",  type: "PUBLIC",  category: "positive" },
  { code: "PARKING",       label: "Удобная парковка",     icon: "🅿️", type: "PUBLIC",  category: "positive" },

  // ── Private: improvement (visible only to master) ────────────────────────
  { code: "CLEANLINESS_BAD",   label: "Чистота",                    icon: null, type: "PRIVATE", category: "improve" },
  { code: "SPEED_BAD",         label: "Скорость",                   icon: null, type: "PRIVATE", category: "improve" },
  { code: "COMMUNICATION_BAD", label: "Общение",                    icon: null, type: "PRIVATE", category: "improve" },
  { code: "LATE_START",        label: "Задержали начало",           icon: null, type: "PRIVATE", category: "improve" },
  { code: "RESULT_MISMATCH",   label: "Результат не как на фото",   icon: null, type: "PRIVATE", category: "improve" },
  { code: "ROOM_COLD",         label: "Холодно в помещении",        icon: null, type: "PRIVATE", category: "improve" },
  { code: "LOUD_MUSIC",        label: "Громкая музыка",             icon: null, type: "PRIVATE", category: "improve" },
  { code: "PAINFUL",           label: "Больновато",                 icon: null, type: "PRIVATE", category: "improve" },
] as const;

async function main() {
  console.log("Seeding review tags...");

  for (const tag of TAGS) {
    await prisma.reviewTag.upsert({
      where: { code: tag.code },
      update: { label: tag.label, icon: tag.icon ?? null, isActive: true },
      create: {
        code: tag.code,
        label: tag.label,
        icon: tag.icon ?? null,
        type: tag.type,
        category: tag.category,
        isActive: true,
      },
    });
    console.log(`  ✓ ${tag.type.padEnd(7)} ${tag.code}`);
  }

  console.log(`\nDone. ${TAGS.length} tags upserted.`);
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
