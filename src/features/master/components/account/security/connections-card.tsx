import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.account.security;

/**
 * CONSOLIDATE-EXTERNAL-LINKING-01: connect/disconnect of external accounts
 * (Telegram / VK) now lives in ONE canonical place — the profile «Связанные
 * аккаунты» card (identity). This tab keeps a pointer to it rather than a second
 * connect surface; delivery toggles live in the Notifications tab. The profile
 * card is reachable from every role via the topbar «Профиль» menu + this link.
 *
 * (Previously this card re-mounted the notification sections, which offered a
 * second connect flow — the duplication this consolidation removes.)
 */
export function ConnectionsCard() {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <header className="mb-4">
        <h2 className="font-display text-base text-text-main">{T.connectionsHeading}</h2>
        <p className="mt-1 text-sm text-text-sec">{T.connectionsManageInProfile}</p>
      </header>
      <Button asChild variant="secondary" size="sm">
        <Link href="/cabinet/profile">
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          {T.connectionsOpenProfile}
        </Link>
      </Button>
    </section>
  );
}
