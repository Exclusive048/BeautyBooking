export function logPublicBlockError(blockName: string, error: unknown, urls: string[] = []) {
  if (process.env.NODE_ENV === "production") return;
  const details = urls.length ? ` urls=${urls.join(", ")}` : "";
  console.error(`[public-profile] ${blockName} failed${details}`, error);
}
