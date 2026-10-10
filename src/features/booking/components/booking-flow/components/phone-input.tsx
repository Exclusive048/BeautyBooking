"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";
import { formatRussianPhone } from "@/features/booking/components/booking-flow/lib/format-phone";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/ui/field-label";

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
      <FieldLabel>
        {T.phoneLabel}
        {required ? <span className="ml-0.5 text-danger-text">*</span> : null}
      </FieldLabel>
      <Input
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
        aria-invalid={error ? true : undefined}
        className={cn("font-mono", error && "border-destructive focus-visible:border-destructive")}
      />
    </label>
  );
}
