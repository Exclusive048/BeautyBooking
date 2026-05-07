import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "default";

type CommonProps = {
  icon: LucideIcon;
  label: string;
  sublabel: string;
  variant?: Variant;
  className?: string;
};

type LinkTileProps = CommonProps & {
  href: string;
  onClick?: never;
};

type ButtonTileProps = CommonProps & {
  href?: never;
  onClick: () => void;
};

type Props = LinkTileProps | ButtonTileProps;

/**
 * Quick-action tile — either a Link (default) or a `<button>` (when caller
 * needs onClick for a modal trigger). Two visual variants: `primary` for
 * the headline tile and `default` for secondary actions.
 */
export function QuickActionTile({
  icon: Icon,
  label,
  sublabel,
  variant = "default",
  className,
  ...rest
}: Props) {
  const isPrimary = variant === "primary";
  const baseClass = cn(
    "flex items-center gap-3 rounded-xl p-3 text-left transition-all",
    isPrimary
      ? "bg-brand-gradient text-white hover:opacity-90"
      : "border border-border-subtle bg-bg-page text-text-main hover:bg-bg-input/70",
    className,
  );

  const iconClass = cn(
    "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
    isPrimary ? "bg-white/20 text-white" : "bg-primary/10 text-primary",
  );

  const content = (
    <>
      <span aria-hidden className={iconClass}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{label}</p>
        <p
          className={cn(
            "mt-0.5 text-xs leading-snug",
            isPrimary ? "text-white/80" : "text-text-sec",
          )}
        >
          {sublabel}
        </p>
      </div>
    </>
  );

  if ("href" in rest && rest.href) {
    return (
      <Link href={rest.href} className={baseClass}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={"onClick" in rest ? rest.onClick : undefined} className={baseClass}>
      {content}
    </button>
  );
}
