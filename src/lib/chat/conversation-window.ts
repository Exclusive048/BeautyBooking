// 29.09 доработки · 31 (PERF-22, решения владельца 31.3 и 31.4): пределы
// чата, видимые человеку.
//
// Список диалогов растёт с КАЖДОЙ записью (`createBooking` заводит чат
// системным сообщением), поэтому он показывает пары, где было движение за
// последний год, — с подписью «Диалоги за последний год». Давняя переписка не
// теряется: пара открывается по ссылке из записи, и сама переписка окном не
// режется.
//
// Переписка пары грузится последними `CHAT_THREAD_PAGE_SIZE` сообщениями,
// более ранние — кнопкой «Показать раньше» (курсор по времени и id).
//
// Модуль без импортов: его читают и сервер (агрегатор), и клиент (подпись).
export const CHAT_CONVERSATIONS_WINDOW_MONTHS = 12;
export const CHAT_THREAD_PAGE_SIZE = 100;

export function chatConversationsWindowStart(now: Date = new Date()): Date {
  const start = new Date(now.getTime());
  start.setUTCMonth(start.getUTCMonth() - CHAT_CONVERSATIONS_WINDOW_MONTHS);
  return start;
}
