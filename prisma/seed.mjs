import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/*const REVIEW_TAG_SEED = [
  {
    code: "FAST",
    label: "Быстро",
    icon: "⚡️",
    type: "PUBLIC",
    category: "positive",
  },
  {
    code: "STERILE",
    label: "Стерильно",
    icon: "💎",
    type: "PUBLIC",
    category: "positive",
  },
  {
    code: "DESIGN",
    label: "Дизайн",
    icon: "🎨",
    type: "PUBLIC",
    category: "positive",
  },
  {
    code: "ATMOSPHERE",
    label: "Атмосфера",
    icon: "💆‍♀️",
    type: "PUBLIC",
    category: "positive",
  },
  {
    code: "PLEASANT_SILENCE",
    label: "Приятное молчание",
    icon: "🤫",
    type: "PUBLIC",
    category: "positive",
  },
  {
    code: "PARKING",
    label: "Парковка",
    icon: "🅿️",
    type: "PUBLIC",
    category: "positive",
  },
  {
    code: "ROOM_COLD",
    label: "Холодно в помещении",
    icon: null,
    type: "PRIVATE",
    category: "improve",
  },
  {
    code: "LOUD_MUSIC",
    label: "Громкая музыка",
    icon: null,
    type: "PRIVATE",
    category: "improve",
  },
  {
    code: "PAINFUL",
    label: "Больновато",
    icon: null,
    type: "PRIVATE",
    category: "improve",
  },
  {
    code: "LATE_START",
    label: "Задержали начало",
    icon: null,
    type: "PRIVATE",
    category: "improve",
  },
];

async function seedReviewTags() {
  for (const tag of REVIEW_TAG_SEED) {
    await prisma.reviewTag.upsert({
      where: { code: tag.code },
      update: {
        label: tag.label,
        icon: tag.icon,
        type: tag.type,
        category: tag.category,
        isActive: true,
      },
      create: {
        code: tag.code,
        label: tag.label,
        icon: tag.icon,
        type: tag.type,
        category: tag.category,
        isActive: true,
      },
    });
  }
}*/

async function main() {
  await prisma.booking.deleteMany();
  await prisma.service.deleteMany();
  await prisma.provider.deleteMany();

  console.log("✅ Seed done");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
