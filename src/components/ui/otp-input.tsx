"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

const DEFAULT_LENGTH = 6;

/**
 * Verification lifecycle of the grid (LOGIN-WOW-01).
 *
 * `idle` — entry. `verifying` — the code is in flight (in-place progress on the
 * grid itself, never a spinner that replaces the form). `success` — the server
 * accepted it; the grid plays a short celebratory sweep while the caller
 * redirects. `error` — rejected; the caller also bumps `shakeSignal` and clears
 * the value, so this state only carries the colour.
 */
export type OtpState = "idle" | "verifying" | "success" | "error";

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
  /**
   * Verification stage. Drives the completion choreography (lock-in cascade →
   * verifying sweep → success sweep). Defaults to `idle`, which is exactly the
   * pre-LOGIN-WOW-01 behaviour, so callers that don't care stay unchanged.
   */
  state?: OtpState;
  className?: string;
};

/**
 * Per-cell choreography. Framer variants (not inline `animate` objects) so a
 * re-render with the same stage does NOT restart the keyframes — only a real
 * stage change does. `custom` carries the cell index, which is what turns six
 * identical animations into one cascade across the grid.
 */
const cellVariants = {
  rest: { y: 0, scale: 1 },
  // 6th digit landed: a quick settle that runs left→right — instant
  // acknowledgment, before the network even answers.
  lock: (index: number) => ({
    y: [0, -3, 0],
    scale: [1, 0.965, 1],
    transition: {
      duration: 0.3,
      delay: index * 0.04,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  }),
  // Accepted: a taller, slower cascade paired with the colour sweep below.
  success: (index: number) => ({
    y: [0, -5, 0],
    scale: [1, 1.06, 1],
    transition: {
      duration: 0.36,
      delay: index * 0.045,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  }),
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
 *
 * LOGIN-WOW-01 adds the completion choreography on top: the cells are wrapped
 * in motion containers (the `<input>` itself is never transformed, so its
 * `focus:-translate-y-0.5` lift and every keyboard/touch behaviour are
 * untouched), and `state` drives lock-in → verifying → success. Every stage is
 * gated on `useReducedMotion` and degrades to an instant state swap.
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
  state = "idle",
  className,
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  // UI-34: эффект двигает фокус ТОЛЬКО когда код обнулили снаружи — неверный
  // код, «Отправить снова», возврат на шаг ввода (`login-client` в этих
  // случаях зовёт `setCode("")`). Тогда пользователь ничего не нажимал, поле
  // опустело само, и начинать надо с первой ячейки.
  //
  // Раньше эффект реагировал на ЛЮБОЕ изменение `value` и утаскивал фокус на
  // «первую пустую» ячейку — из-за чего исправить среднюю цифру было нельзя:
  // стрелками до неё дойти можно, но первый же ввод отбрасывал курсор назад,
  // и вся реализованная Arrow-навигация не стоила ничего. Перевод курсора
  // вперёд теперь происходит там, где ему и место, — в обработчиках ввода и
  // вставки (см. `handleChange` / `handlePaste`).
  const previousValueRef = useRef(value);
  useEffect(() => {
    const previous = previousValueRef.current;
    previousValueRef.current = value;
    if (value.length === 0 && previous.length > 0) {
      refs.current[0]?.focus();
    }
  }, [value]);

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
    // Курсор вперёд — от введённой ячейки, а не от «первой пустой»: правка
    // середины кода ведёт к следующей цифре, а не в начало.
    refs.current[Math.min(index + 1, length - 1)]?.focus();
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
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  const complete = value.length >= length;
  // Reduced motion collapses every stage to `rest` — the colour/ring changes
  // below still communicate the stage, without translation or scale.
  const cellStage = reduce ? "rest" : state === "success" ? "success" : complete ? "lock" : "rest";
  const inFlight = state === "verifying" || state === "success";

  return (
    <div
      ref={gridRef}
      role="group"
      aria-label={groupLabel}
      aria-busy={state === "verifying" || undefined}
      className={cn("relative grid w-full gap-1.5 sm:gap-2", className)}
      style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}
    >
      {Array.from({ length }).map((_, index) => {
        const filled = Boolean(value[index]);
        return (
          <motion.div
            key={index}
            className="relative min-w-0"
            custom={index}
            variants={cellVariants}
            initial={false}
            animate={cellStage}
          >
            <input
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="text"
              inputMode="numeric"
              // UI-34: `one-time-code` на КАЖДОЙ ячейке — Safari/iOS
              // подставляет код из SMS/почты по группе полей, а `off` на
              // остальных пяти подстановку подавлял.
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={2}
              value={value[index] ?? ""}
              onChange={(event) => handleChange(index, event)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={handlePaste}
              disabled={disabled}
              aria-label={UI_TEXT.a11y.otpDigit(index + 1, length)}
              className={cn(
                "h-12 w-full min-w-0 rounded-2xl border bg-bg-card text-center text-lg font-semibold tabular-nums text-text-main shadow-sm outline-none sm:h-14 sm:text-xl",
                "transition-[border-color,box-shadow,transform,background-color] duration-200",
                "focus:-translate-y-0.5 focus:border-primary focus:ring-2 focus:ring-primary/15",
                "disabled:cursor-not-allowed",
                // While a code is in flight the grid must read as "working", not
                // as "dead form" — so the disabled dimming is dropped for those
                // two stages only. Emitted as one branch (never both) because
                // `cn` is a plain join and two competing `disabled:opacity-*`
                // utilities would resolve by stylesheet order, not class order.
                inFlight ? "disabled:opacity-100" : "disabled:opacity-50",
                state === "error"
                  ? "border-red-400/70 bg-red-50/60 dark:bg-red-950/30"
                  : filled
                    ? "login-otp-pop border-primary bg-primary/5"
                    : "border-border-control",
                // Reduced-motion fallback for the verifying sweep: a static
                // tint, so the stage is still visible without any movement.
                state === "verifying" ? "border-primary/60" : null,
              )}
            />

            {/* Success colour sweep — one per cell, staggered left→right. Sits
                over the digit at 10% alpha, so the code stays readable.
                `primary-magenta` rather than `primary`: the burgundy `--primary`
                is nearly the dark card's own value (#7A102C on #302026) and the
                beat would be invisible in dark, whereas magenta reads in both
                themes and is the brand gradient's own end stop. */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl bg-primary-magenta/10 ring-2 ring-inset ring-primary-magenta"
              initial={false}
              animate={{ opacity: state === "success" ? 1 : 0 }}
              transition={
                reduce
                  ? { duration: 0 }
                  : { duration: 0.22, delay: state === "success" ? index * 0.045 : 0 }
              }
            />
          </motion.div>
        );
      })}

      {/* Verifying: a light sweep travelling across the grid in place of a
          spinner. Motion-only, so reduced-motion drops it entirely (the static
          `border-primary/60` above carries the stage instead). */}
      {state === "verifying" && !reduce ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[2] overflow-hidden rounded-2xl"
        >
          <motion.span
            className="absolute inset-y-0 block w-1/3 bg-gradient-to-r from-transparent via-primary-magenta/25 to-transparent"
            initial={{ x: "-120%" }}
            animate={{ x: "320%" }}
            transition={{ duration: 1.15, repeat: Infinity, ease: "easeInOut" }}
          />
        </span>
      ) : null}
    </div>
  );
}
