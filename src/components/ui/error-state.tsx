"use client";

import { m } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  Lock,
  Sparkles,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { DISTANCE, MOTION, STAGGER } from "@/lib/ui/motion";

export type ErrorStateVariant = "default" | "danger" | "warning";

// Icons are addressed by a string NAME, never by passing the component itself.
// `not-found.tsx` / `403` are Server (or Server-adjacent) special files, and a
// lucide component can't cross the RSC boundary — passing one crashes the page
// («Only plain objects can be passed to Client Components»). A name union makes
// that mistake unrepresentable (see CLAUDE.md — RSC serialization). Add a name
// here when a caller needs a new icon.
export type ErrorStateIconName = "sparkles" | "lock";

const NAMED_ICONS: Record<ErrorStateIconName, LucideIcon> = {
  sparkles: Sparkles,
  lock: Lock,
};

export type ErrorStateAction = {
  label: string;
  onClick?: () => void;
  href?: string;
};

type Props = {
  /** Icon by NAME (not component) — see `ErrorStateIconName`. Falls back to the
   *  variant's default icon when omitted. */
  icon?: ErrorStateIconName;
  title: string;
  description?: string;
  primaryAction?: ErrorStateAction;
  secondaryAction?: ErrorStateAction;
  variant?: ErrorStateVariant;
  className?: string;
};

const DEFAULT_ICONS: Record<ErrorStateVariant, LucideIcon> = {
  default: AlertCircle,
  danger: XCircle,
  warning: AlertTriangle,
};

// UI-26/27 (AUDIT-CAMPAIGN-02 п.8): иконка ошибки/предупреждения — статусная
// поверхность, значит токены, а не литералы с `dark:`-вилкой. Заодно уходит
// расхождение с каноном: `danger` был на `rose`, а `rose` в этом проекте
// закреплён за «идёт сейчас» (таблица статусов в SKILL.md), то есть цвет
// активного состояния подписывался под отказ. ⚠️ Заливка кружка была
// `bg-rose-500/10`, а у статусных токенов альфа запечена в переменную и
// модификатор к ним не применяется — поэтому `/10` не переносится, берётся
// готовая `*-surface` (в светлой она сплошная и близка к прежним 10% на белом,
// в тёмной — своя, откалиброванная в шаге 1 кампании).
const ICON_COLORS: Record<ErrorStateVariant, string> = {
  default: "text-accent-text",
  danger: "text-danger-text",
  warning: "text-warning-text",
};

const ICON_BG: Record<ErrorStateVariant, string> = {
  default: "bg-primary/10",
  danger: "bg-danger-surface",
  warning: "bg-warning-surface",
};

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: STAGGER } },
};

const itemVariants = {
  hidden: { opacity: 0, y: DISTANCE.rise },
  visible: { opacity: 1, y: 0, transition: MOTION.base },
};

function ActionButton({ action, variant }: { action: ErrorStateAction; variant: "primary" | "secondary" }) {
  if (action.href) {
    return (
      <Button variant={variant} asChild>
        <Link href={action.href}>{action.label}</Link>
      </Button>
    );
  }
  return (
    <Button variant={variant} onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

export function ErrorState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  variant = "default",
  className,
}: Props) {
  const Icon = icon ? NAMED_ICONS[icon] : DEFAULT_ICONS[variant];
  const container = containerVariants;
  const item = itemVariants;

  return (
    <m.div
      className={cn("flex flex-col items-center px-4 py-16 text-center", className)}
      variants={container}
      initial="hidden"
      animate="visible"
    >
      {/* Icon circle */}
      <m.div
        variants={item}
        className={cn(
          "flex h-20 w-20 items-center justify-center rounded-full",
          ICON_BG[variant]
        )}
      >
        <Icon className={cn("h-10 w-10", ICON_COLORS[variant])} aria-hidden />
      </m.div>

      {/* Title */}
      <m.h1
        variants={item}
        className="mt-6 text-2xl font-bold text-text-main md:text-3xl"
      >
        {title}
      </m.h1>

      {/* Description */}
      {description && (
        <m.p
          variants={item}
          className="mt-3 max-w-sm text-base leading-relaxed text-text-sec"
        >
          {description}
        </m.p>
      )}

      {/* Actions */}
      {(primaryAction ?? secondaryAction) && (
        <m.div
          variants={item}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          {primaryAction && <ActionButton action={primaryAction} variant="primary" />}
          {secondaryAction && <ActionButton action={secondaryAction} variant="secondary" />}
        </m.div>
      )}
    </m.div>
  );
}
