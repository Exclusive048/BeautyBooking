import { redirect } from "next/navigation";

/**
 * STUDIO-FINANCE-REMOVE-A (2026-05-18).
 *
 * The standalone studio Finance page was removed: every meaningful slice
 * it offered (period revenue, breakdown by master, breakdown by service)
 * is part of `/cabinet/studio/analytics`. A separate page would duplicate
 * that surface — payouts, commission splits and expense tracking aren't
 * built yet, so there'd be nothing to differentiate Finance from
 * Analytics today.
 *
 * This route exists only to redirect old bookmarks / external links to
 * the canonical analytics page (no 404). When a real payout flow lands,
 * Finance will return with content distinct from analytics — tracked in
 * BACKLOG.
 */
export default function StudioFinanceRedirect(): never {
  redirect("/cabinet/studio/analytics");
}
