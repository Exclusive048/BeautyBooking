import { Crown } from "lucide-react";
import { FocalImage } from "@/components/ui/focal-image";
import { UI_TEXT } from "@/lib/ui/text";

type PlanTier = "FREE" | "PRO" | "PREMIUM";

type Props = {
  name: string;
  avatarUrl: string | null;
  /** When true, status renders as "Премиум · Nд" with a crown. */
  isTrial: boolean;
  trialDaysLeft: number;
  /** Falls back to FREE label when not on trial. */
  planTier: PlanTier;
};

const PLAN_LABEL: Record<PlanTier, string> = {
  FREE: UI_TEXT.cabinetMaster.userChip.planLabels.free,
  PRO: UI_TEXT.cabinetMaster.userChip.planLabels.pro,
  PREMIUM: UI_TEXT.cabinetMaster.userChip.planLabels.premium,
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

/**
 * Bottom-of-sidebar block: avatar + display name + subscription / trial
 * tagline. Styled as a quiet card — no hover affordance because clicking
 * is owned by the explicit "Профиль" nav item above.
 */
export function MasterUserChip({
  name,
  avatarUrl,
  isTrial,
  trialDaysLeft,
  planTier,
}: Props) {
  const showCrown = isTrial || planTier === "PREMIUM";
  const statusText = isTrial
    ? UI_TEXT.cabinetMaster.userChip.trialStatusTemplate.replace(
        "{days}",
        String(Math.max(trialDaysLeft, 0)),
      )
    : PLAN_LABEL[planTier];

  return (
    <div className="flex items-center gap-3 border-t border-border-subtle px-4 py-3">
      {avatarUrl ? (
        <FocalImage
          src={avatarUrl}
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
        />
      ) : (
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bg-input text-xs font-semibold text-text-sec ring-1 ring-border-subtle"
        >
          {initialsOf(name)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-main">{name}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-text-sec">
          {showCrown ? (
            <Crown className="h-3 w-3 shrink-0 text-primary" aria-hidden />
          ) : null}
          <span className="truncate">{statusText}</span>
        </p>
      </div>
    </div>
  );
}
