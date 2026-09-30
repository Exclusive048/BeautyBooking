import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { Button, type ButtonVariant, type ButtonSize } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Shared empty-state primitive — consolidates ~10-15 cabinet empty-state
 * implementations into a single component with consistent visual treatment.
 *
 * Per `.claude/skills/ui-ux-pro-max/SKILL.md` section 16 «Empty states»:
 * centered icon + title + description + optional secondary CTA. Two visual
 * variants observed across the codebase:
 *
 *   - **compact** (default) — flex centered, no card frame. Used inside
 *     tables / dropdowns / panels that already provide their own surface
 *     (cities-empty, users-empty, exception-empty-state, etc).
 *   - **card** — `rounded-2xl border-dashed bg-bg-card/60` frame. Used as
 *     standalone page-level empty states (notifications, portfolio,
 *     services, application/offer empty states).
 *
 * Icon size split:
 *   - **sm** (default) — small icon `h-10/h-12 text-text-sec/40`. Matches
 *     the skill's reference example for section-level empties.
 *   - **lg** — large icon-circle (`h-14 w-14 rounded-full bg-bg-input`
 *     container + `h-6 w-6` icon inside). Used by portfolio + services
 *     page-level empties where the action is prominent.
 *
 * Action accepts either an `onClick` handler OR `href` for a Link — never
 * both (enforced by TypeScript discriminated union). Optional `leadingIcon`
 * renders a lucide icon prefix inside the button (matches the existing
 * exception-empty-state «+ Добавить исключение» pattern).
 *
 * `children` slot renders below the action, для feature-specific extras
 * like portfolio's 3-tip grid OR application's «reset filter» link.
 */

type EmptyStateActionBase = {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** SETUP-GUIDE-01: метка, по которой подсказка «Первых шагов» подсвечивает кнопку. */
  guide?: string;
};

export type EmptyStateAction =
  | (EmptyStateActionBase & { onClick: () => void; href?: never })
  | (EmptyStateActionBase & { href: string; onClick?: never });

export type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  variant?: "compact" | "card";
  iconSize?: "sm" | "lg";
  action?: EmptyStateAction;
  children?: ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon: Icon,
  variant = "compact",
  iconSize = "sm",
  action,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        variant === "card" ? "rounded-2xl border border-dashed border-border-subtle bg-bg-card/60" : null,
        // Отступы — дефолт: `py-8`/`py-4` вызывающего побеждают (`cn` —
        // tailwind-merge; схлопнутая колонка канбана просит `py-4`).
        variant === "card" ? "px-6" : "px-4",
        "py-12",
        className,
      )}
    >
      {Icon ? (
        iconSize === "lg" ? (
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-bg-input">
            <Icon className="h-6 w-6 text-text-sec/60" aria-hidden />
          </div>
        ) : (
          <Icon className="mb-3 h-12 w-12 text-text-sec/40" aria-hidden />
        )
      ) : null}

      <p
        className={cn(
          "font-display text-text-main",
          iconSize === "lg" ? "text-lg" : "text-base",
          description ? "mb-1" : "",
        )}
      >
        {title}
      </p>

      {description ? (
        <p
          className={cn(
            "max-w-md text-sm leading-relaxed text-text-sec",
            action || children ? "mb-4" : "",
          )}
        >
          {description}
        </p>
      ) : null}

      {action ? <EmptyStateActionButton action={action} /> : null}

      {children}
    </div>
  );
}

function EmptyStateActionButton({ action }: { action: EmptyStateAction }) {
  const { label, leadingIcon: LeadingIcon, variant = "secondary", size = "md", guide } = action;
  const content = (
    <>
      {LeadingIcon ? <LeadingIcon className="mr-1.5 h-4 w-4" aria-hidden /> : null}
      {label}
    </>
  );

  if ("href" in action && action.href) {
    return (
      <Button asChild variant={variant} size={size} data-guide={guide}>
        <Link href={action.href}>{content}</Link>
      </Button>
    );
  }

  return (
    <Button variant={variant} size={size} onClick={action.onClick} data-guide={guide}>
      {content}
    </Button>
  );
}
