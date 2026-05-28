import { isProduction } from "@/lib/env";

export function logPublicBlockError(blockName: string, error: unknown, urls: string[] = []) {
  if (isProduction) return;
  const details = urls.length ? ` urls=${urls.join(", ")}` : "";
  console.error(`[public-profile] ${blockName} failed${details}`, error);
}
