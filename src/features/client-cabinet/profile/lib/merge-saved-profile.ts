import type { ProfileDTO } from "@/lib/client-cabinet/profile.service";

/**
 * PWA-RELOAD-01 — ответ автосейва не перетирает то, что пользователь печатает.
 *
 * Поля профиля клиента — управляемые инпуты поверх SWR-данных, а автосейв
 * отправляет патч через 700 мс паузы. Раньше ответ сервера клался в кэш
 * целиком, и это било по вводу двумя путями:
 *   - сервер тримит строки — пауза после «Нижний » возвращала «Нижний», и
 *     пробел исчезал из поля прямо под курсором;
 *   - если пользователь продолжил печатать, пока запрос в полёте, ответ
 *     возвращал поле к отправленному значению, а следующий сейв — обратно:
 *     текст в поле прыгал.
 *
 * Правило: редактируемые поля берутся из ЛОКАЛЬНОГО (оптимистичного) состояния
 * — оно всегда равно последнему вводу, — а всё, что вычисляет сервер
 * (заполненность, подтверждённость телефона/почты, аватар, привязки, счётчики),
 * — из ответа. Канонический вид (обрезанные пробелы, `+7XXXXXXXXXX`) приедет
 * со следующей загрузкой страницы; при вводе он только мешает.
 */
export function mergeSavedProfile(server: ProfileDTO, local: ProfileDTO | undefined): ProfileDTO {
  if (!local) return server;
  return {
    ...server,
    personal: {
      ...server.personal,
      firstName: local.personal.firstName,
      lastName: local.personal.lastName,
      city: local.personal.city,
      birthDate: local.personal.birthDate,
      hideAgeYear: local.personal.hideAgeYear,
    },
    contacts: {
      ...server.contacts,
      phone: local.contacts.phone,
      email: local.contacts.email,
    },
  };
}
