import Link from "next/link";
import { ArrowRight, Crown, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MasterAccountPlan } from "@/lib/master/account-view.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.account.account;

type Props = {
  plan: MasterAccountPlan;
};

const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

function formatPeriodEnd(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getDate();
  const month = MONTHS_GENITIVE[date.getMonth()] ?? "";
  return `${day} ${month} ${date.getFullYear()}`;
}

function tierLabel(tier: MasterAccountPlan["tier"]): string {
  if (tier === "PRO") return T.planTierPro;
  if (tier === "PREMIUM") return T.planTierPremium;
  if (tier === "FREE") return T.planTierFree;
  return T.planTierUnknown;
}

/**
 * Plan summary — read-only display. The actual subscription
 * management lives at `/cabinet/billing`; this card is just a
 * shortcut surface for the master to see what they're on and click
 * through.
 */
export function PlanCard({ plan }: Props) {
  const Icon = plan.tier === "PREMIUM" ? Crown : plan.tier === "PRO" ? Zap : Crown;
  const periodLabel = formatPeriodEnd(plan.currentPeriodEndIso);

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <h2 className="font-display text-base text-text-main">{T.planHeading}</h2>
      <div className="mt-4 flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base text-text-main">{tierLabel(plan.tier)}</p>
          {plan.isPaid ? (
            <>
              <p className="mt-1 text-xs text-text-sec">
                {periodLabel
                  ? T.planActiveUntilTemplate.replace("{date}", periodLabel)
                  : T.planActiveIndefinite}
              </p>
              <p className="mt-0.5 text-[11px] text-text-sec">
                {plan.autoRenew ? T.planAutoRenewOn : T.planAutoRenewOff}
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-text-sec">{T.planFreeBody}</p>
          )}
        </div>
      </div>
      <div className="mt-4">
        <Button asChild variant="secondary" size="sm">
          <Link href="/cabinet/billing" className="gap-1.5">
            {T.manageBillingCta}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </Button>
      </div>
    </section>
  );
}
