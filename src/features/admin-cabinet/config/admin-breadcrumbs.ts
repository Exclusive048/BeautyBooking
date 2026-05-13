import { UI_TEXT } from "@/lib/ui/text";
import { matchAdminNavItem } from "@/features/admin-cabinet/config/admin-nav";

export type AdminCrumb = {
  label: string;
  /** Omit on the current page. */
  href?: string;
};

/** Resolves a `[root → current]` breadcrumb trail from a pathname using
 * the same nav config the sidebar reads from. Always starts with the
 * "Админка" root crumb (linked to `/admin`); the current page's label
 * is appended without an href. Returns just the root when the pathname
 * doesn't match any known admin entry — keeps the topbar consistent on
 * routes that exist on disk but aren't surfaced in the new nav yet
 * (e.g. `/admin/cities`, `/admin/reviews`). */
export function resolveAdminBreadcrumbs(pathname: string): AdminCrumb[] {
  const root: AdminCrumb = {
    label: UI_TEXT.adminPanel.breadcrumb.root,
    href: "/admin",
  };
  const item = matchAdminNavItem(pathname);
  if (!item) return [root];
  if (item.key === "dashboard") {
    // Dashboard is the root — only one crumb (current page).
    return [{ label: item.pageTitle }];
  }
  return [root, { label: item.pageTitle }];
}
