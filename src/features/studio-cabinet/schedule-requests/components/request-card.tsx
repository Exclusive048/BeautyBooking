"use client";

import { ScheduleChangeRequestStatus } from "@/lib/prisma-enums";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import * as UI_TEXT from "@/lib/ui/text";
import type { ScheduleRequestReview } from "@/lib/schedule/schedule-changes-shared";
import { buildReviewPreview, buildSchedulePayloadPreview } from "../lib/payload-display";
import { ApproveDialog } from "./approve-dialog";
import { PayloadPreview } from "./payload-preview";
import { RejectDialog } from "./reject-dialog";
import { UI_FMT, VIEWER_TZ } from "@/lib/ui/fmt";
import { useIsHydrated } from "@/hooks/use-is-hydrated";

type Props = {
  request: {
    id: string;
    status: ScheduleChangeRequestStatus;
    comment: string | null;
    createdAt: string;
    updatedAt: string;
    provider: { id: string; name: string };
    payload: unknown;
    review: ScheduleRequestReview | null;
  };
};

const T = UI_TEXT.studioCabinet.scheduleRequests;

function statusBadge(status: ScheduleChangeRequestStatus) {
  switch (status) {
    case ScheduleChangeRequestStatus.PENDING:
      return <Badge variant="warning">{T.status.pending}</Badge>;
    case ScheduleChangeRequestStatus.APPROVED:
      return <Badge variant="success">{T.status.approved}</Badge>;
    case ScheduleChangeRequestStatus.REJECTED:
      return <Badge variant="danger">{T.status.rejected}</Badge>;
    default:
      return <Badge variant="muted">{status}</Badge>;
  }
}

function formatCreatedAt(value: string): string {
  return UI_FMT.date(value, "dayMonthShortTime", { timeZone: VIEWER_TZ });
}

export function RequestCard({ request }: Props) {
  const router = useRouter();
  // Часы зрителя — только после гидратации: сервер считает их в поясе
  // контейнера, и первый клиентский рендер обязан совпасть с серверным
  // (иначе «Hydration failed», 29.09 доработки · 24).
  const hydrated = useIsHydrated();
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const preview = buildSchedulePayloadPreview(request.payload);
  const review = request.review ? buildReviewPreview(request.review) : null;
  const isPendingRequest = request.status === ScheduleChangeRequestStatus.PENDING;

  function refresh() {
    startTransition(() => router.refresh());
  }

  return (
    <>
      <Card>
        <CardContent className="space-y-4 p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-text-main">
                {request.provider.name}
              </div>
              <div className="mt-0.5 text-xs text-text-sec">
                {T.submittedAt}: {hydrated ? formatCreatedAt(request.createdAt) : null}
              </div>
            </div>
            {statusBadge(request.status)}
          </div>

          <PayloadPreview preview={preview} review={review} />

          {request.comment ? (
            <div className="rounded-lg border border-border-subtle bg-bg-input/40 px-3 py-2">
              <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-text-sec">
                {T.commentLabel}
              </div>
              <div className="text-sm text-text-main">{request.comment}</div>
            </div>
          ) : null}

          {isPendingRequest ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                variant="primary"
                onClick={() => setApproveOpen(true)}
                disabled={isPending}
              >
                <Check className="h-4 w-4" aria-hidden />
                {T.actions.approve}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setRejectOpen(true)}
                disabled={isPending}
              >
                <X className="h-4 w-4" aria-hidden />
                {T.actions.reject}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {isPendingRequest ? (
        <>
          <ApproveDialog
            open={approveOpen}
            onClose={() => setApproveOpen(false)}
            requestId={request.id}
            providerName={request.provider.name}
            onResolved={refresh}
          />
          <RejectDialog
            open={rejectOpen}
            onClose={() => setRejectOpen(false)}
            requestId={request.id}
            providerName={request.provider.name}
            onResolved={refresh}
          />
        </>
      ) : null}
    </>
  );
}
