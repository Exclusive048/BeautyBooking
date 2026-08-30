/**
 * VK-NOTIFICATIONS-FLAG-A → ENV-SPLIT-01: env-флаг
 * NEXT_PUBLIC_VK_NOTIFICATIONS_ENABLED удалён вместе с остальными
 * переключалками, но саму подсистему включить нельзя — канала доставки VK в
 * `notifications/delivery.ts` НЕ СУЩЕСТВУЕТ (там только push/telegram/email).
 * Включённый тумблер в кабинете создавал бы no-op подписку: пользователь ждёт
 * уведомлений, которые никогда не придут.
 *
 * Поэтому доступность — константа В КОДЕ, а не в env: недописанная фича — это
 * свойство кодовой базы, и включаться она обязана коммитом, который дописывает
 * канал, а не строчкой в .env.production. Когда доставка появится (queue
 * handler + VK send API), переключите на `true` В ТОМ ЖЕ коммите.
 *
 * Модуль намеренно без env-импортов и без "server-only": его читают и
 * клиентский тумблер (`vk-notifications.tsx`), и серверный роут
 * (`api/integrations/vk/settings`).
 */
export const VK_NOTIFICATIONS_AVAILABLE = false;
