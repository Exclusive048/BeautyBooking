/**
 * Plain-data types shared across the admin-panel shell. The shell receives
 * only serialisable user data from the server layout — no Prisma models,
 * no React components — so it can live on the client side of the RSC
 * boundary without dragging server-only modules into the bundle.
 */

export type AdminPanelRole = "SUPERADMIN" | "ADMIN";

export type AdminPanelUser = {
  /** Display name as it should appear in the sidebar chip. Resolved on the
   * server from `displayName ?? firstName ?? email/phone` so the client
   * never has to read those fields. */
  name: string;
  /** Public S3 URL or null. UserChip falls back to initials when null. */
  avatarUrl: string | null;
  /** Highest-privilege role for the current session. `SUPERADMIN` wins
   * over `ADMIN` when both are present in the roles array. */
  role: AdminPanelRole;
};
