import { reportPublicBlockError } from "@/lib/observability/public-block-error";

/** `sources` — имена сервисов, которые читала секция (29.09 доработки · 13). */
export function logPublicBlockError(blockName: string, error: unknown, sources: string[] = []) {
  reportPublicBlockError("public-profile", blockName, error, sources);
}
