import { z } from "zod";

export const telegramSettingsSchema = z.object({
  enabled: z.boolean(),
});
