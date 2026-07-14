"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

const DEFAULT_LENGTH = 6;

type OtpInputProps = {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Number of digit boxes. Default 6 — the login OTP length. */
  length?: number;
  /** Accessible label for the box group. */
  groupLabel?: string;
  /**
   * Increment to trigger a one-shot shake of the whole grid (wrong-code
   * feedback). Any change to a higher number replays the shake; `0` is inert.
   */
  shakeSignal?: number;
  className?: string;
};

/**
 * Shared OTP entry grid (LOGIN-REDESIGN-01) — one box per digit, with
 * auto-advance, backspace-cascade, arrow navigation, full-code paste, a
 * digit-pop on fill and a grid-shake on error. Behaviour is unchanged from the
 * previous inline login implementation; the per-box `aria-label` stays
 * «Цифра N из M» so `getByLabel("Цифра 1 из 6")` QA locators keep resolving.
 *
 * `onComplete` fires as soon as the last box is filled (the login uses this to
 * auto-submit the code), so the caller need not wire a separate submit for the
 * common path.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus = true,
  length = DEFAULT_LENGTH,
  groupLabel,
  shakeSignal = 0,
  className,
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (value.length >= length) {
      refs.current[length - 1]?.focus();
    } else {
      refs.current[value.length]?.focus();
    }
  }, [value, length]);

  // Wrong-code shake: retrigger the CSS animation by toggling the class on the
  // grid element directly (manual DOM update — not React state), forcing a
  // reflow between remove and add so a second error replays the animation.
  useEffect(() => {
    if (shakeSignal <= 0) return;
    const el = gridRef.current;
    if (!el) return;
    el.classList.remove("login-otp-shake");
    el.getBoundingClientRect(); // force reflow so the re-add restarts the animation
    el.classList.add("login-otp-shake");
    const clear = () => el.classList.remove("login-otp-shake");
    el.addEventListener("animationend", clear, { once: true });
    return () => el.removeEventListener("animationend", clear);
  }, [shakeSignal]);

  function handleChange(index: number, event: React.ChangeEvent<HTMLInputElement>) {
    const digit = event.target.value.replace(/\D/g, "").slice(-1);
    if (!digit) return;
    const chars = value.split("").slice(0, length);
    chars[index] = digit;
    const next = chars.join("").slice(0, length);
    onChange(next);
    if (next.length === length) {
      onComplete?.(next);
    }
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (value[index]) {
        const chars = value.split("");
        chars[index] = "";
        onChange(chars.join(""));
      } else if (index > 0) {
        const chars = value.split("");
        chars[index - 1] = "";
        onChange(chars.join(""));
        refs.current[index - 1]?.focus();
      }
    } else if (event.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(event: React.ClipboardEvent) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    onChange(pasted);
    if (pasted.length === length) {
      onComplete?.(pasted);
    }
  }

  return (
    <div
      ref={gridRef}
      role="group"
      aria-label={groupLabel}
      className={cn("grid w-full gap-1.5 sm:gap-2", className)}
      style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}
    >
      {Array.from({ length }).map((_, index) => {
        const filled = Boolean(value[index]);
        return (
          <input
            key={index}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={2}
            value={value[index] ?? ""}
            onChange={(event) => handleChange(index, event)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={handlePaste}
            disabled={disabled}
            aria-label={`Цифра ${index + 1} из ${length}`}
            className={cn(
              "h-12 min-w-0 rounded-2xl border bg-bg-card text-center text-lg font-semibold tabular-nums text-text-main shadow-sm outline-none sm:h-14 sm:text-xl",
              "transition-[border-color,box-shadow,transform,background-color] duration-200",
              "focus:-translate-y-0.5 focus:border-primary focus:ring-2 focus:ring-primary/15",
              "disabled:cursor-not-allowed disabled:opacity-50",
              filled ? "login-otp-pop border-primary bg-primary/5" : "border-border-subtle",
            )}
          />
        );
      })}
    </div>
  );
}
