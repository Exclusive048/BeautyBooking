import { ProviderProfileFull } from "../types";

export const providerFullMock: Record<string, ProviderProfileFull> = {
  p1: {
    id: "p1",
    name: "Айгерим — брови и ламинирование",
    tagline: "Естественный эффект, стерильность, аккуратная форма.",
    address: "ул. Абая, 52 · 2 этаж",
    district: "Центр",
    rating: 4.9,
    reviews: 128,
    categories: ["Брови", "Ресницы"],
    works: Array.from({ length: 10 }).map((_, i) => ({ id: `w${i}`, title: `Работа #${i + 1}` })),
    services: [
      { id: "s1", name: "Коррекция бровей", durationMin: 45, price: 1700 },
      { id: "s2", name: "Окрашивание бровей", durationMin: 60, price: 2200 },
      { id: "s3", name: "Ламинирование бровей", durationMin: 75, price: 2900 },
    ],
  },
  p2: {
    id: "p2",
    name: "Studio Velvet",
    tagline: "Ногти, ресницы, визаж. Запись день-в-день.",
    address: "пр-т Достык, 17",
    district: "Медеуский",
    rating: 4.8,
    reviews: 312,
    categories: ["Маникюр", "Ресницы", "Визаж"],
    works: Array.from({ length: 10 }).map((_, i) => ({ id: `w${i}`, title: `Работа #${i + 1}` })),
    services: [
      { id: "s10", name: "Маникюр + покрытие", durationMin: 120, price: 3500 },
      { id: "s11", name: "Наращивание ресниц 2D", durationMin: 150, price: 4500 },
      { id: "s12", name: "Макияж дневной", durationMin: 60, price: 3000 },
    ],
  },
  p3: {
    id: "p3",
    name: "Руслан — барбер",
    tagline: "Кроп, фейд, борода. Быстро и ровно.",
    address: "ул. Тимирязева, 24",
    district: "Бостандык",
    rating: 4.7,
    reviews: 94,
    categories: ["Барбер"],
    works: Array.from({ length: 10 }).map((_, i) => ({ id: `w${i}`, title: `Работа #${i + 1}` })),
    services: [
      { id: "s20", name: "Стрижка", durationMin: 45, price: 1500 },
      { id: "s21", name: "Борода", durationMin: 30, price: 900 },
      { id: "s22", name: "Стрижка + борода", durationMin: 75, price: 2200 },
    ],
  },
};
