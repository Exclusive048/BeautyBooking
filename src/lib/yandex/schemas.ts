import { z } from "zod";

// FIX-YANDEX-OAUTH — Yandex ID OAuth callback query schema. Yandex returns a
// plain `?code=&state=` top-level redirect (no `payload`/`device_id` like VK).
export const yandexCallbackSchema = z.object({
  code: z.string().trim().min(1),
  state: z.string().trim().min(1),
});

export type YandexCallback = z.infer<typeof yandexCallbackSchema>;
