import { CalendarClock } from "lucide-react";
import * as UI_TEXT from "@/lib/ui/text";
import type { ScheduleRequestLists } from "../server/list.service";
import { RequestCard } from "./request-card";

type Props = {
  data: ScheduleRequestLists;
};

const T = UI_TEXT.studioCabinet.scheduleRequests;

export function ScheduleRequestsPage({ data }: Props) {
  const { pending, resolved } = data;

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-main">{T.title}</h1>
        <p className="mt-1 text-sm text-text-sec">{T.subtitle}</p>
      </header>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-text-main">
            {T.pendingTitle}
          </h2>
          <span className="text-xs text-text-sec">
            {T.pendingCount.replace("{count}", String(pending.length))}
          </span>
        </div>

        {pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-border-subtle bg-bg-card px-4 py-12 text-center">
            <CalendarClock className="mb-3 h-10 w-10 text-text-sec/40" aria-hidden />
            <p className="mb-1 text-base font-semibold text-text-main">
              {T.emptyPendingTitle}
            </p>
            <p className="max-w-sm text-sm text-text-sec">{T.emptyPendingBody}</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {pending.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </div>
        )}
      </div>

      {resolved.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-text-main">
            {T.resolvedTitle}
          </h2>
          <div className="grid gap-3">
            {resolved.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
