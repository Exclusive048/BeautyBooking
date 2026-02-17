"use client";

import Link from "next/link";
import { useId } from "react";
import { cn } from "@/lib/cn";

type LegalConsentVariant = "short" | "detailed" | "split";

type LegalConsentCheckboxProps = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  variant?: LegalConsentVariant;
  className?: string;
};

function ConsentText({ variant, linkClass }: { variant: LegalConsentVariant; linkClass: string }) {
  const termsLink = (
    <Link href="/terms" className={linkClass}>
      Пользовательским соглашением
    </Link>
  );
  const privacyLink = (
    <Link href="/privacy" className={linkClass}>
      Политикой конфиденциальности
    </Link>
  );

  if (variant === "detailed") {
    return (
      <>
        Нажимая «Получить код», вы подтверждаете, что ознакомились и принимаете {termsLink} и{" "}
        {privacyLink}, а также даете согласие на обработку персональных данных.
      </>
    );
  }

  if (variant === "split") {
    return (
      <>
        <span>Я принимаю {termsLink}.</span>
        <span className="mt-1 block">Я принимаю {privacyLink}.</span>
      </>
    );
  }

  return (
    <>
      Я принимаю {termsLink} и {privacyLink}.
    </>
  );
}

export function LegalConsentCheckbox({
  checked,
  onCheckedChange,
  variant = "short",
  className,
}: LegalConsentCheckboxProps) {
  const inputId = useId();

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-border-subtle bg-bg-input/70 p-3 text-xs text-text-sec",
        className
      )}
    >
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border border-border-subtle bg-bg-card accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      />
      <label htmlFor={inputId} className="cursor-pointer leading-relaxed">
        <ConsentText
          variant={variant}
          linkClass="rounded-sm text-text-main underline underline-offset-4 decoration-dotted transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        />
      </label>
    </div>
  );
}
