import { FocalImage } from "@/components/ui/focal-image";
import {
  formatHeroDate,
  getTimeGreeting,
  minutesUntil,
} from "@/features/master/lib/time-greeting";
import { pickAdvice, type AdviceContext } from "@/features/master/lib/dashboard-advice";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.dashboard.hero;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

function formatHm(date: Date): string {
  const h = String(date.getUTCHours()).padStart(2, "0");
  const m = String(date.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

type NextBookingInfo = {
  startAtUtc: Date;
  clientName: string;
  serviceTitle: string;
  clientAvatarUrl: string | null;
};

type Props = {
  firstName: string;
  now: Date;
  context: AdviceContext;
  nextBooking: NextBookingInfo | null;
};

/**
 * Greeting hero — gradient brand surface with a time-of-day greeting on
 * the left and a "next client" widget on the right. Static + server-rendered;
 * no client interactivity required. The advice line comes from
 * `pickAdvice(context)` which is a small rule engine that we'll later
 * swap for the in-app Advisor module.
 */
export function GreetingHero({ firstName, now, context, nextBooking }: Props) {
  const greeting = getTimeGreeting(now);
  const dateLabel = formatHeroDate(now);
  const advice = pickAdvice(context);

  return (
    <section className="relative overflow-hidden rounded-2xl bg-brand-gradient p-6 text-white lg:p-8">
      {/* Soft radial highlights for depth — pointer-events-none so they
          don't intercept clicks on the next-client widget. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-white/5 blur-2xl"
      />

      <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-white/70">
            {dateLabel}
          </p>
          <h1 className="mb-3 font-display text-3xl leading-tight lg:text-4xl">
            {greeting}, {firstName} 👋
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-white/90">{advice}</p>
        </div>

        {nextBooking ? (
          <div className="flex min-w-[260px] items-center gap-3 rounded-xl bg-white/15 p-3 backdrop-blur-sm">
            {nextBooking.clientAvatarUrl ? (
              <FocalImage
                src={nextBooking.clientAvatarUrl}
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-white/30"
              />
            ) : (
              <span
                aria-hidden
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20 text-sm font-semibold ring-1 ring-white/30"
              >
                {initialsOf(nextBooking.clientName)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/70">
                {T.nextClientLabel}
              </p>
              <p className="truncate text-sm font-medium">{nextBooking.clientName}</p>
              <p className="truncate text-xs text-white/80">
                {formatHm(nextBooking.startAtUtc)} · {nextBooking.serviceTitle}
              </p>
            </div>
            <div aria-hidden className="h-8 w-px bg-white/20" />
            <div className="text-right">
              <p className="text-[10px] text-white/70">{T.nextClientIn}</p>
              <p className="font-display text-lg leading-none tabular-nums">
                {Math.max(minutesUntil(nextBooking.startAtUtc, now), 0)}
                <span className="ml-0.5 text-xs font-normal">{T.minutesShort}</span>
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
