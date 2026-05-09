"use client";

import { LogOut, Monitor } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { MasterAccountSessions } from "@/lib/master/account-view.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.account.security;

// Inline pluraliser — there's no shared helper in `master/components`
// scope, and a 5-line function isn't worth a new lib module.
const RU_PLURAL = new Intl.PluralRules("ru-RU");
function pluralize(n: number, one: string, few: string, many: string): string {
  const form = RU_PLURAL.select(n);
  if (form === "one") return one;
  if (form === "few") return few;
  return many;
}

type Props = {
  sessions: MasterAccountSessions;
};

/**
 * Active sessions card — minimalist by design. The `RefreshSession`
 * schema lacks `userAgent` / `ipAddress` columns, so a detailed list
 * of devices would surface invented data. We surface only:
 *   - the active session count (informative, honest)
 *   - a single "revoke all other sessions" action
 *
 * The endpoint revokes everything and re-issues cookies for the
 * current request, so this device stays logged in transparently.
 * Backlog: full sessions list once schema migration adds device
 * metadata + a UA parser is wired in.
 */
export function SessionsCard({ sessions }: Props) {
  const router = useRouter();
  const [revoking, setRevoking] = useState(false);

  const countLabel = pluralize(
    sessions.activeCount,
    T.sessionsCountTemplateOne,
    T.sessionsCountTemplateFew,
    T.sessionsCountTemplateMany
  ).replace("{count}", String(sessions.activeCount));

  const handleRevoke = async () => {
    if (revoking) return;
    if (!sessions.hasOthers) {
      window.alert(T.revokeOthersOnlyCurrent);
      return;
    }
    if (!window.confirm(T.revokeOthersConfirm)) return;
    setRevoking(true);
    try {
      const response = await fetch("/api/master/account/sessions/revoke-others", {
        method: "POST",
      });
      if (!response.ok) {
        window.alert(T.revokeOthersError);
        return;
      }
      const json = await response.json().catch(() => null);
      const revokedCount: number = json?.data?.revokedCount ?? 0;
      // The current session was just re-issued — reload so the page
      // picks up fresh cookies + updated session count.
      window.alert(
        T.revokeOthersSuccessTemplate.replace("{count}", String(Math.max(0, revokedCount - 1)))
      );
      router.refresh();
    } finally {
      setRevoking(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <h2 className="font-display text-base text-text-main">{T.sessionsHeading}</h2>
      <div className="mt-3 flex items-center gap-3">
        <Monitor className="h-4 w-4 shrink-0 text-text-sec" aria-hidden />
        <p className="text-sm text-text-main">{countLabel}</p>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-text-sec">{T.sessionsBody}</p>
      <div className="mt-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRevoke}
          disabled={revoking || !sessions.hasOthers}
          className="gap-1.5"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          {T.revokeOthersCta}
        </Button>
      </div>
    </section>
  );
}
