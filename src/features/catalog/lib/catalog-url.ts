import { withQuery } from "@/lib/public-urls";

/**
 * Single source of truth for `/catalog` deep-link params (QA-104).
 *
 * The catalog reader (`catalog-page-client.tsx`) is canonical: it reads
 * `serviceQuery`, `globalCategoryId` (a real GlobalCategory **id**, resolved
 * via `findUnique({ where: { id } })` — NOT a slug), `availableToday="true"`,
 * `hot="true"`, `sort`, etc. Home/footer link-builders previously emitted
 * `q` / `category=<slug>` / `available=today`, which the reader silently
 * ignored → the filter was dropped (the core home→catalog funnel, incl.
 * "available today"). Build every catalog deep-link through here so the
 * names can't drift from the reader again.
 *
 * Pure (only `withQuery`) — safe in client + server components.
 */
export type CatalogLinkParams = {
  /** Free-text service search (reader: `serviceQuery`). */
  serviceQuery?: string | null;
  /** GlobalCategory **id** (reader: `globalCategoryId`; must be the id, not a slug). */
  globalCategoryId?: string | null;
  /** "Available today" filter (reader compares `availableToday === "true"`). */
  availableToday?: boolean;
  /** Hot-slots filter (reader compares `hot === "true"`). */
  hot?: boolean;
  /** Sort key, e.g. "popular" (reader: `sort`). */
  sort?: string | null;
};

export function buildCatalogUrl(params: CatalogLinkParams = {}): string {
  return withQuery("/catalog", {
    serviceQuery: params.serviceQuery?.trim() || undefined,
    globalCategoryId: params.globalCategoryId?.trim() || undefined,
    availableToday: params.availableToday ? true : undefined,
    hot: params.hot ? true : undefined,
    sort: params.sort?.trim() || undefined,
  });
}
