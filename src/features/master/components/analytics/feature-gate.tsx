import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.analytics.lock;

type Props = {
  available: boolean;
  children: React.ReactNode;
  /** Optional override for the lock card's CTA target — defaults to the
   * billing page since 30a's only locked-feature path is "upgrade plan". */
  href?: string;
};

/**
 * Wraps a locked section: when `available` is true, renders children
 * directly. When false, blurs and dims the children (so the master
 * sees a tantalising preview shape) and lifts a lock card on top.
 *
 * Children are rendered either way — for SSR layout stability — but
 * with `pointer-events: none` so the master can't accidentally
 * interact with the locked controls.
 */
export function FeatureGate({ available, children, href = "/cabinet/billing" }: Props) {
  if (available) return <>{children}</>;

  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none select-none opacity-30 blur-[2px]">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="max-w-sm rounded-2xl border border-primary/30 bg-bg-card p-6 shadow-card">
          <div className="mb-2 inline-flex items-center gap-1.5 text-primary">
            <Lock className="h-4 w-4" aria-hidden />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
              {T.title}
            </span>
          </div>
          <p className="mb-4 text-sm text-text-main">{T.body}</p>
          <Button asChild variant="primary" size="sm">
            <Link href={href}>{T.cta}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
