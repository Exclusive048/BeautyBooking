"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import { formatRussianPhone } from "@/features/booking/components/booking-flow/lib/format-phone";

type Props = {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  error?: string | null;
};

const T = UI_TEXT.publicProfile.bookingWidget;

export function PhoneInput({ value, onChange, required, autoFocus, error }: Props) {
  // Locally we hold the masked string; parent receives the raw digits-only
  // form so submit logic doesn't have to re-parse on the way out.
  const [display, setDisplay] = useState<string>(() => formatRussianPhone(value).display);

  useEffect(() => {
    // Sync from parent (e.g. auth pre-fill on /api/me response).
    const next = formatRussianPhone(value).display;
    if (next !== display) setDisplay(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-text-main">
        {T.phoneLabel}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        autoFocus={autoFocus}
        value={display}
        placeholder={T.phonePlaceholder}
        onChange={(event) => {
          const parsed = formatRussianPhone(event.target.value);
          setDisplay(parsed.display);
          onChange(parsed.digits);
        }}
        className={cn(
          "w-full rounded-md border bg-bg-card px-3 py-2.5 font-mono text-sm text-text-main outline-none transition placeholder:text-text-placeholder",
          error
            ? "border-rose-500 focus:border-rose-600"
            : "border-border-subtle focus:border-primary",
        )}
      />
    </label>
  );
}
