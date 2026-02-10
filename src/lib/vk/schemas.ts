import { z } from "zod";

export const vkSettingsSchema = z.object({
  enabled: z.boolean(),
});
