import Link from "next/link";
import { Info } from "lucide-react";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.notificationsV2;

/**
 * STUDIO-NOTIFICATIONS-A info banner — explains that the studio feed is
 * what the OWNER sees (per the existing single-recipient delivery model),
 * that master-addressed booking notifications surface in the master's
 * personal cabinet, and that per-team push settings live in the studio
 * settings page (placeholder route — settings redesign pending).
 */
export function NotificationsInfoBanner() {
  // Split the template once at the `{settingsLink}` placeholder so we
  // can render the link inline without dangerouslySetInnerHTML.
  const [before, after] = T.infoBanner.split("{settingsLink}");
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-bg-input/40 p-3 text-sm text-text-sec">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-text-sec/70" aria-hidden />
      <p>
        {before}
        <Link
          href="/cabinet/studio/settings"
          className="text-accent-text underline-offset-2 hover:underline"
        >
          {T.infoBannerLink}
        </Link>
        {after}
      </p>
    </div>
  );
}
