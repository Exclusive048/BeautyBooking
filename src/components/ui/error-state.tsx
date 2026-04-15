"use client";

import { motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type ErrorStateVariant = "default" | "danger" | "warning";

export type ErrorStateAction = {
  label: string;
  onClick?: () => void;
  href?: string;
};

type Props = {
  icon?: LucideIcon;
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

const ICON_COLORS: Record<ErrorStateVariant, string> = {
  default: "text-primary",
  danger: "text-rose-500 dark:text-rose-400",
  warning: "text-amber-500 dark:text-amber-400",
};

const ICON_BG: Record<ErrorStateVariant, string> = {
  default: "bg-primary/10",
  danger: "bg-rose-500/10",
  warning: "bg-amber-500/10",
};

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  },
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
  const Icon = icon ?? DEFAULT_ICONS[variant];

  return (
    <motion.div
      className={cn("flex flex-col items-center px-4 py-16 text-center", className)}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Icon circle */}
      <motion.div
        variants={itemVariants}
        className={cn(
          "flex h-20 w-20 items-center justify-center rounded-full",
          ICON_BG[variant]
        )}
      >
        <Icon className={cn("h-10 w-10", ICON_COLORS[variant])} aria-hidden />
      </motion.div>

      {/* Title */}
      <motion.h1
        variants={itemVariants}
        className="mt-6 text-2xl font-bold text-text-main md:text-3xl"
      >
        {title}
      </motion.h1>

      {/* Description */}
      {description && (
        <motion.p
          variants={itemVariants}
          className="mt-3 max-w-sm text-base leading-relaxed text-text-sec"
        >
          {description}
        </motion.p>
      )}

      {/* Actions */}
      {(primaryAction ?? secondaryAction) && (
        <motion.div
          variants={itemVariants}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          {primaryAction && <ActionButton action={primaryAction} variant="primary" />}
          {secondaryAction && <ActionButton action={secondaryAction} variant="secondary" />}
        </motion.div>
      )}
    </motion.div>
  );
}
