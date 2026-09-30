import { MessageSquareText } from "lucide-react";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioReviewsTopService } from "../lib/types";

const T = UI_TEXT.studioCabinet.reviewsV2.stats;

type Props = {
  services: StudioReviewsTopService[];
};

/**
 * Top services by review count — replaces the reference's
 * "топ/анти-топ мастера" stat per user spec. Simpler signal (what
 * services attract feedback) and avoids ranking masters publicly.
 */
export function TopServicesCard({ services }: Props) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
        {T.topServicesTitle}
      </p>
      {services.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 text-center">
          <MessageSquareText className="h-6 w-6 text-text-sec/30" aria-hidden />
          <p className="text-xs text-text-sec">{T.topServicesEmpty}</p>
        </div>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {services.map((s, index) => (
            <li
              key={s.serviceName}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="font-mono text-[11px] text-text-sec tabular-nums">
                  {index + 1}.
                </span>
                <span className="truncate text-text-main">{s.serviceName}</span>
              </span>
              <span className="shrink-0 font-mono text-xs text-text-sec tabular-nums">
                {T.topServicesCount.replace("{count}", String(s.reviewCount))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
