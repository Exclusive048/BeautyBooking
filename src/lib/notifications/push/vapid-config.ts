/**
 * Pure helper extracted from `vapid.ts` so its predicate is unit-testable
 * without triggering the module-load side-effect (`webpush.setVapidDetails`).
 *
 * Contract — push is enabled only when ALL THREE keys resolve to a non-empty
 * string after trimming. Whitespace-only env values count as unconfigured.
 *
 * Inputs are pre-trimmed strings (or `undefined`) to match how `vapid.ts`
 * reads them: `env.X?.trim()`.
 */
export function isVapidConfigured(
  publicKey: string | undefined,
  privateKey: string | undefined,
  email: string | undefined
): boolean {
  return Boolean(publicKey && privateKey && email);
}
