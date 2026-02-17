import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type FooterLinkProps = {
  href: string;
  children: ReactNode;
  external?: boolean;
  className?: string;
  "aria-label"?: string;
};

const baseClass =
  "text-[14px] text-neutral-700 transition-colors duration-200 underline-offset-4 hover:underline hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:text-neutral-300";

export function FooterLink({ href, children, external, className, ...rest }: FooterLinkProps) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(baseClass, className)}
        {...rest}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={cn(baseClass, className)} {...rest}>
      {children}
    </Link>
  );
}
