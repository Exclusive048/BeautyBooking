"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { History, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApiResponse } from "@/lib/types/api";
import type { ClientDetailView } from "@/lib/master/clients-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { ClientDetailHeader } from "./client-detail-header";
import { ClientDetailSkeleton } from "./client-detail-skeleton";
import { ClientDetailStats } from "./client-detail-stats";
import { ClientNotesDisplay } from "./client-notes-display";
import { ClientVisitHistory } from "./client-visit-history";
import { EmptyDetailState } from "./empty-detail-state";

const T = UI_TEXT.cabinetMaster.clients.detail.actions;
const DETAIL_T = UI_TEXT.cabinetMaster.clients.detail;
const LIST_T = UI_TEXT.cabinetMaster.clients.list;

type Props = {
  /** Currently selected client key (`user:<id>` / `phone:<phone>`) or
   *  null when no row is active. */
  selectedKey: string | null;
  onBack: () => void;
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; data: ClientDetailView }
  | { kind: "error"; message: string };

/**
 * Right-pane composition for the selected client. Client component since
 * 27a-FIX-URL — selection state lives in `<ClientsPaneClient>` (parent),
 * detail data is fetched lazily from `/api/master/clients/[key]/detail`
 * when the key changes. The URL stays clean of `?id=`.
 *
 * Renders four states: empty (no selection), loading (skeleton), error
 * (small inline message), loaded (header / stats / notes / history /
 * actions). The skeleton mirrors the loaded layout so the swap is quiet.
 *
 * Sub-components (`ClientDetailHeader`, `ClientDetailStats`, etc.) stay
 * pure presentation — they don't use hooks, so rendering them inside a
 * client tree adds no hydration cost.
 */
export function ClientDetailPanel({ selectedKey, onBack }: Props) {
  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [prevKey, setPrevKey] = useState<string | null>(selectedKey);
  const now = useMemo(() => new Date(), []);

  // React 19: sync derived state to the `selectedKey` prop during render
  // instead of inside an effect — avoids the `set-state-in-effect` lint
  // hit and an extra render pass. The effect below only flips state to
  // `loaded` / `error` once the fetch resolves.
  if (prevKey !== selectedKey) {
    setPrevKey(selectedKey);
    setState(selectedKey ? { kind: "loading" } : { kind: "idle" });
  }

  useEffect(() => {
    if (!selectedKey) return;
    let cancelled = false;
    const controller = new AbortController();

    fetch(`/api/master/clients/${encodeURIComponent(selectedKey)}/detail`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const json = (await response.json().catch(() => null)) as
          | ApiResponse<ClientDetailView>
          | null;
        if (!response.ok || !json || !json.ok) {
          const message = json && !json.ok ? json.error.message : `API ${response.status}`;
          throw new Error(message);
        }
        if (!cancelled) setState({ kind: "loaded", data: json.data });
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        const message =
          error instanceof Error && error.message
            ? error.message
            : "Не удалось загрузить клиента.";
        setState({ kind: "error", message });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedKey]);

  if (!selectedKey || state.kind === "idle") {
    return <EmptyDetailState />;
  }
  if (state.kind === "loading") {
    return <ClientDetailSkeleton />;
  }
  if (state.kind === "error") {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
        <p className="mb-2 font-medium">{DETAIL_T.emptyTitle}</p>
        <p className="mb-3">{state.message}</p>
        <Button type="button" variant="ghost" size="sm" className="rounded-lg" onClick={onBack}>
          {LIST_T.backToList}
        </Button>
      </div>
    );
  }

  const client = state.data;
  return (
    <article className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <ClientDetailHeader client={client} onBack={onBack} now={now} />
      <ClientDetailStats client={client} now={now} />
      <ClientNotesDisplay notes={client.notes} />
      <ClientVisitHistory visits={client.recentVisits} />

      {(client.activeBookingId || client.totalHistoryCount > 5) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {client.activeBookingId ? (
            <Button asChild variant="primary" size="md" className="rounded-xl">
              <Link
                href={`/cabinet/master/bookings?focus=${client.activeBookingId}&chat=open`}
              >
                <MessageSquare className="mr-1.5 h-4 w-4" aria-hidden />
                {T.openChat}
              </Link>
            </Button>
          ) : null}
          {client.totalHistoryCount > 5 ? (
            <Button asChild variant="secondary" size="md" className="rounded-xl">
              <Link
                href={`/cabinet/master/bookings?client=${encodeURIComponent(client.key)}`}
              >
                <History className="mr-1.5 h-4 w-4" aria-hidden />
                {T.allHistory}
              </Link>
            </Button>
          ) : null}
        </div>
      )}
    </article>
  );
}
