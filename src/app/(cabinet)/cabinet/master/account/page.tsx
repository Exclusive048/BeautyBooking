import { redirect } from "next/navigation";

/**
 * fix-04a: `/account` itself has no content — it redirects to the
 * default sub-page (notifications). The shared layout in
 * `account/layout.tsx` renders the page header + nav for every
 * sub-route.
 */
export default function MasterAccountIndexRoute() {
  redirect("/cabinet/master/account/notifications");
}
