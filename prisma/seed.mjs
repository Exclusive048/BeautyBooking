import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const REVIEW_TAG_SEED = [
  { code: "FAST", label: "Быстро", icon: "⚡️", type: "PUBLIC", category: "positive" },
  { code: "STERILE", label: "Стерильно", icon: "💎", type: "PUBLIC", category: "positive" },
  { code: "DESIGN", label: "Дизайн", icon: "🎨", type: "PUBLIC", category: "positive" },
  { code: "ATMOSPHERE", label: "Атмосфера", icon: "💆‍♀️", type: "PUBLIC", category: "positive" },
  { code: "PLEASANT_SILENCE", label: "Приятное молчание", icon: "🤫", type: "PUBLIC", category: "positive" },
  { code: "PARKING", label: "Парковка", icon: "🅿️", type: "PUBLIC", category: "positive" },
  { code: "ROOM_COLD", label: "Холодно в помещении", icon: null, type: "PRIVATE", category: "improve" },
  { code: "LOUD_MUSIC", label: "Громкая музыка", icon: null, type: "PRIVATE", category: "improve" },
  { code: "PAINFUL", label: "Больновато", icon: null, type: "PRIVATE", category: "improve" },
  { code: "LATE_START", label: "Задержали начало", icon: null, type: "PRIVATE", category: "improve" },
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
}

async function main() {
  await seedReviewTags();

  await prisma.booking.deleteMany();
  await prisma.service.deleteMany();
  await prisma.provider.deleteMany();

  await prisma.provider.create({
    data: {
      id: "p1",
      type: "MASTER",
      name: "Айгерим — брови и ламинирование",
      tagline: "Естественный эффект, без перегиба. Стерильно и аккуратно.",
      rating: 4.9,
      reviews: 128,
      priceFrom: 1700,
      address: "Абая 52, 2 этаж",
      district: "Центр",
      categories: ["Брови", "Ресницы"],
      availableToday: true,
      bufferBetweenBookingsMin: 10,
      services: {
        create: [
          { id: "s1", name: "Коррекция бровей", durationMin: 45, price: 1700 },
          {
            id: "s2",
            name: "Окрашивание бровей",
            durationMin: 60,
            price: 2200,
          },
          {
            id: "s3",
            name: "Ламинирование бровей",
            durationMin: 75,
            price: 2900,
          },
        ],
      },
    },
  });

  await prisma.provider.create({
    data: {
      id: "p2",
      type: "STUDIO",
      name: "Studio Velvet",
      tagline: "Ногти, ресницы, визаж. Можно записаться день-в-день.",
      rating: 4.8,
      reviews: 312,
      priceFrom: 2500,
      address: "пр-т Достык, 17",
      district: "Медеуский",
      categories: ["Маникюр", "Ресницы", "Визаж"],
      availableToday: false,
      bufferBetweenBookingsMin: 0,
      services: {
        create: [
          {
            id: "s10",
            name: "Маникюр + покрытие",
            durationMin: 120,
            price: 3500,
          },
          {
            id: "s11",
            name: "Наращивание ресниц 2D",
            durationMin: 150,
            price: 4500,
          },
          { id: "s12", name: "Макияж дневной", durationMin: 60, price: 5000 },
        ],
      },
    },
  });

  await prisma.booking.create({
    data: {
      providerId: "p1",
      serviceId: "s1",
      slotLabel: "Сегодня 12:30",
      clientName: "Мария",
      clientPhone: "+7 900 000-00-00",
      comment: "Можно без сильного изгиба",
      status: "CONFIRMED",
    },
  });

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
