import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { FocalImage } from "@/components/ui/focal-image";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioTopMasterRow } from "../server/types";

const T = UI_TEXT.studioCabinet.dashboardV2.topMasters;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

export function StudioTopMasters({ masters }: { masters: StudioTopMasterRow[] }) {
  if (masters.length === 0) {
    return (
      <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-semibold tracking-tight text-text-main">
              {T.title}
            </h3>
            <p className="mt-0.5 text-xs text-text-sec">{T.subtitle}</p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-text-sec">
          <Users className="h-8 w-8 opacity-30" aria-hidden />
          <p>{T.empty}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold tracking-tight text-text-main">
            {T.title}
          </h3>
          <p className="mt-0.5 text-xs text-text-sec">{T.subtitle}</p>
        </div>
        <Link
          href="/cabinet/studio/team"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
        >
          {T.seeAll}
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </header>

      <ul className="flex flex-col gap-2">
        {masters.map((master, index) => {
          const rowBg =
            index === 0 ? "bg-primary/5 ring-1 ring-primary/10" : "bg-bg-input/40";
          return (
            <li
              key={master.id}
              className={`grid grid-cols-[24px_1fr_auto] items-center gap-3 rounded-xl px-3 py-2.5 ${rowBg}`}
            >
              <span className="text-center font-mono text-xs font-semibold text-text-sec">
                #{index + 1}
              </span>
              <div className="min-w-0">
                <div className="mb-1.5 flex items-center gap-2">
                  {master.avatarUrl ? (
                    <FocalImage
                      src={master.avatarUrl}
                      alt=""
                      width={28}
                      height={28}
                      className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bg-card text-[10px] font-semibold text-text-sec ring-1 ring-border-subtle"
                    >
                      {initialsOf(master.name)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-text-main">
                      {master.name}
                    </div>
                    <div className="truncate text-[11px] text-text-sec">
                      {master.serviceLabel
                        ? `${master.serviceLabel} · `
                        : ""}
                      {T.bookingsTemplate.replace("{count}", String(master.bookingsCount))}
                    </div>
                  </div>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-bg-input">
                  <div
                    className="h-full rounded-full bg-brand-gradient"
                    style={{ width: `${master.percentOfTop}%` }}
                  />
                </div>
              </div>
              <div className="whitespace-nowrap text-right">
                <div className="font-display text-sm font-semibold tabular-nums text-text-main">
                  {UI_FMT.priceLabel(master.revenueKopeks)}
                </div>
                <div className="mt-0.5 text-[11px] text-text-sec">
                  ★ {master.rating.toFixed(1)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
