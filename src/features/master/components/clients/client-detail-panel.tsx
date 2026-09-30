"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { History, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClientDetailView } from "@/lib/master/clients-view.service";
import * as UI_TEXT from "@/lib/ui/text";
import { ClientDetailHeader } from "./client-detail-header";
import { ClientDetailSkeleton } from "./client-detail-skeleton";
import { ClientDetailStats } from "./client-detail-stats";
import { ClientNotesEditor } from "./client-notes-editor";
import { ClientVisitHistory } from "./client-visit-history";
import { EmptyDetailState } from "./empty-detail-state";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";

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

    fetchJsonWithAuth<ClientDetailView>(`/api/master/clients/${encodeURIComponent(selectedKey)}/detail`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((data) => {
        if (!cancelled) setState({ kind: "loaded", data });
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        setState({ kind: "error", message: serverMessageOr(error, DETAIL_T.loadFailed) });
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
      <div className="rounded-2xl border border-danger-border bg-danger-surface p-5 text-sm text-danger-text">
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
      {/* MASTER-CLIENTS-FIX-A #6: notes editor replaces the «Скоро»
          placeholder. Backend already exposes
          `PATCH /api/master/clients/[clientKey]/card` with master auth
          + provider-scoped ownership — pure UI work to surface it.
          Privacy invariant #25 preserved: notes never leave the
          master DTO. */}
      <ClientNotesEditor clientKey={client.key} initialNotes={client.notes} />
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
            // MASTER-CLIENTS-FIX-A #7а: URL used to carry the raw cuid
            // via `client.key`. Now we pass an HMAC-signed opaque token
            // (`historyToken`) scoped to the current master. The
            // bookings page route verifies it before applying the
            // filter. Two bugs were closed: the URL no longer leaks
            // internal ids, and the route handler now actually reads
            // the param (previously ignored it → wrong destination).
            <Button asChild variant="secondary" size="md" className="rounded-xl">
              <Link
                href={`/cabinet/master/bookings?client=${encodeURIComponent(client.historyToken)}`}
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
