import { isProduction } from "@/lib/env";

export function logPublicStudioBlockError(blockName: string, error: unknown, urls: string[] = []) {
  if (isProduction) return;
  const details = urls.length ? ` urls=${urls.join(", ")}` : "";
  console.error(`[public-studio] ${blockName} failed${details}`, error);
}
