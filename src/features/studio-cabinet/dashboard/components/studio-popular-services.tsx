import { Scissors } from "lucide-react";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioPopularService } from "../server/types";

const T = UI_TEXT.studioCabinet.dashboardV2.popularServices;

export function StudioPopularServices({
  services,
}: {
  services: StudioPopularService[];
}) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <header className="mb-4">
        <h3 className="font-display text-base font-semibold tracking-tight text-text-main">
          {T.title}
        </h3>
        <p className="mt-0.5 text-xs text-text-sec">{T.subtitle}</p>
      </header>

      {services.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Scissors className="h-8 w-8 text-text-sec/40" aria-hidden />
          <p className="text-sm text-text-sec">{T.empty}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {services.map((service) => (
            <li
              key={service.id}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl bg-bg-input/40 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-text-main">
                  {service.name}
                </div>
                <div className="mt-0.5 text-2xs text-text-sec">
                  {T.countTemplate
                    .replace("{count}", String(service.bookingsCount))
                    .replace("{percent}", String(service.sharePercent))}
                </div>
              </div>
              <div className="font-display text-sm font-semibold tabular-nums text-text-main">
                {UI_FMT.priceLabel(service.priceKopeks)}
              </div>
              <div className="font-mono text-xs font-semibold tabular-nums text-accent-text">
                {UI_FMT.priceLabel(service.revenueKopeks)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
