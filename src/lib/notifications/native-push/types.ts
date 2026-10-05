import type { MobilePushApnsEnvironment, MobilePushProvider, NotificationType } from "@prisma/client";

/**
 * MOBILE-B2 — общие типы native push (FCM / APNs / RuStore).
 *
 * Модуль без зависимостей рантайма: его импортируют и очередь
 * (`queue/types.ts`), и клиенты провайдеров, и тесты.
 */

/** Версия формы `data` — приложение может различать её, когда форма поменяется. */
export const NATIVE_PUSH_PAYLOAD_VERSION = "1";

/**
 * Действия «Подтвердить» / «Отклонить» у новой записи мастеру. Одно имя на
 * обе платформы: на iOS — `aps.category`, на Android — `data.actions` (в FCM
 * сообщение без блока `notification`: уведомление с кнопками строит само
 * приложение; в RuStore блок остаётся — см. `providers/rustore.ts`).
 */
export const BOOKING_DECISION_ACTIONS = "BOOKING_DECISION";
export type NativePushActions = typeof BOOKING_DECISION_ACTIONS;

/** Каналы уведомлений Android — приложение создаёт их с этими id. */
export const NATIVE_PUSH_CHANNELS = ["bookings", "messages", "general", "promo"] as const;
export type NativePushChannel = (typeof NATIVE_PUSH_CHANNELS)[number];

/**
 * Готовое сообщение — одно на все провайдеры. Строится ТОЛЬКО
 * `buildNativePushMessage` (`payload.ts`): общий текст по типу события + id
 * сущностей + путь экрана приложения, без ПДн. В таком виде оно лежит в
 * очереди (Redis) и уходит провайдеру.
 */
export type NativePushMessage = {
  type: NotificationType;
  title: string;
  body: string;
  /** `map<string, string>` — FCM и RuStore принимают в `data` только строки. */
  data: Record<string, string>;
  /** Ключ замены: новое уведомление с тем же ключом заменяет прежнее в шторке. */
  collapseKey?: string;
  /** Группа в шторке (iOS `thread-id`). */
  threadId?: string;
  androidChannelId: NativePushChannel;
  actions?: NativePushActions;
};

/** Сообщение на отправку: к готовому добавляется счётчик непрочитанного. */
export type NativePushOutgoing = NativePushMessage & { badge?: number };

export type NativePushTarget = {
  token: string;
  apnsEnvironment?: MobilePushApnsEnvironment | null;
};

/**
 * Исход отправки на одно устройство — ради решения «что делать со строкой»:
 *  · `invalid-token` — провайдер сказал, что токена больше нет (удалено
 *    приложение, токен сменился, чужой проект) → строка удаляется;
 *  · `retry` — сеть, таймаут, 429, 5xx, протухшая авторизация → повтор задачей;
 *  · `failed` — отказ, который повтором не лечится (форма запроса, ключи) →
 *    лог, строка остаётся.
 * `reason` — код провайдера или класс сбоя; токен в него не попадает никогда.
 */
export type NativePushSendResult =
  | { outcome: "sent" }
  | { outcome: "invalid-token"; reason: string }
  | { outcome: "retry"; reason: string }
  | { outcome: "failed"; reason: string };

export interface NativePushProviderClient {
  readonly provider: MobilePushProvider;
  send(target: NativePushTarget, message: NativePushOutgoing): Promise<NativePushSendResult>;
}

/**
 * RES-22 — граница одного запроса к сервису доставки (как у Web Push): FCM,
 * APNs и RuStore отвечают за доли секунды, доставку после приёма гарантируют
 * они сами, а отправка идёт из слота воркера — зависший сервис не должен его
 * держать.
 */
export const NATIVE_PUSH_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Срок жизни уведомления у сервиса доставки: телефон, который был выключен
 * дольше суток, получит не пачку устаревших «Новая запись», а ничего — всё
 * актуальное есть в центре уведомлений.
 */
export const NATIVE_PUSH_TTL_SECONDS = 24 * 60 * 60;
