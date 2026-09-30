import { reportPublicBlockError } from "@/lib/observability/public-block-error";

/** `sources` — имена сервисов, которые читала секция (29.09 доработки · 13). */
export function logPublicStudioBlockError(blockName: string, error: unknown, sources: string[] = []) {
  reportPublicBlockError("public-studio", blockName, error, sources);
}
