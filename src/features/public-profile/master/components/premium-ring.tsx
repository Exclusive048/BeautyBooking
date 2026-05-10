import { Crown } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  active: boolean;
  children: React.ReactNode;
};

/**
 * Halo wrapper for the master avatar. When the active subscription is
 * PREMIUM, renders a soft brand-gradient ring + a crown chip pinned to
 * the bottom-right; otherwise renders children as-is. Sized to host a
 * 96–132 px avatar.
 */
export function PremiumRing({ active, children }: Props) {
  if (!active) return <>{children}</>;
  return (
    <div className="relative inline-block">
      <div
        aria-hidden
        className="bg-brand-gradient absolute -inset-[3px] rounded-full opacity-90 blur-[1px]"
      />
      <div aria-hidden className="bg-brand-gradient absolute -inset-[3px] rounded-full" />
      <div className="relative rounded-full bg-bg-card p-[3px]">
        {children}
      </div>
      <span
        className="bg-brand-gradient absolute -bottom-1 -right-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-brand"
      >
        <Crown className="h-3 w-3" aria-hidden strokeWidth={2.4} />
        {UI_TEXT.publicProfile.hero.premiumBadge}
      </span>
    </div>
  );
}
