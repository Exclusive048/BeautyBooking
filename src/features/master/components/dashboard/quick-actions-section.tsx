"use client";

import { useRouter } from "next/navigation";
import { ImagePlus, Lock, Plus, Share2, UserPlus } from "lucide-react";
import { QuickActionTile } from "@/features/master/components/dashboard/quick-action-tile";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.dashboard.quickActions;

type Props = {
  /** Public profile URL — passed to the share button when available. */
  publicProfileUrl: string | null;
};

/**
 * 5-tile quick-action panel. The headline tile spans the full row and uses
 * the brand gradient; the rest are secondary tiles in a 2-up grid below.
 * "Добавить запись" routes to `?manual=1` so the existing modal opens
 * (works from any page in the cabinet).
 */
export function QuickActionsSection({ publicProfileUrl }: Props) {
  const router = useRouter();

  const handleAddBooking = () => {
    router.push("/cabinet/master/dashboard?manual=1");
  };

  const handleShareProfile = async () => {
    if (!publicProfileUrl) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ url: publicProfileUrl });
        return;
      } catch {
        // User dismissed share sheet — fall through to clipboard.
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(publicProfileUrl);
      } catch {
        // No-op — the failure isn't worth a banner here.
      }
    }
  };

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <header className="mb-4">
        <h2 className="font-display text-lg text-text-main">{T.title}</h2>
        <p className="mt-0.5 text-xs text-text-sec">{T.subtitle}</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <QuickActionTile
          icon={Plus}
          label={T.addBooking}
          sublabel={T.addBookingSub}
          variant="primary"
          onClick={handleAddBooking}
          className="col-span-2"
        />
        <QuickActionTile
          icon={Lock}
          label={T.blockTime}
          sublabel={T.blockTimeSub}
          href="/cabinet/master/schedule"
        />
        <QuickActionTile
          icon={Share2}
          label={T.sharePublic}
          sublabel={T.sharePublicSub}
          onClick={handleShareProfile}
        />
        <QuickActionTile
          icon={UserPlus}
          label={T.invitePeople}
          sublabel={T.invitePeopleSub}
          href="/cabinet/master/clients"
        />
        <QuickActionTile
          icon={ImagePlus}
          label={T.addPortfolio}
          sublabel={T.addPortfolioSub}
          href="/cabinet/master/profile"
        />
      </div>
    </section>
  );
}
