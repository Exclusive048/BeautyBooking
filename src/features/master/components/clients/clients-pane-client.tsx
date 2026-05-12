"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import type { ClientListItemView } from "@/lib/master/clients-view.service";
import { ClientDetailPanel } from "./client-detail-panel";
import { ClientsList } from "./clients-list";

type Props = {
  initialClients: ClientListItemView[];
  isFiltering: boolean;
};

/**
 * Top-level coordinator for the list + detail panes (27a-FIX-URL).
 *
 * Holds the only piece of selection state — the active `clientKey` —
 * in a plain `useState`. No URL push, no localStorage: a refresh shows
 * the list view, which keeps the URL free of internal client IDs and
 * makes accidental link-sharing safe. List filtering / sorting / search
 * still flow through the URL (they're not sensitive) and hydrate the
 * `initialClients` prop from the server orchestrator.
 *
 * Mobile responsive: when `selectedKey` is set on a small viewport, the
 * list pane is hidden so the detail panel takes the full column. The
 * detail header carries an `onBack` button (`lg:hidden`) that clears
 * the selection. Desktop always shows both panes side by side.
 */
export function ClientsPaneClient({ initialClients, isFiltering }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const detailOpenOnMobile = Boolean(selectedKey);
  const now = useMemo(() => new Date(), []);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div
        className={cn(
          "lg:col-span-5 xl:col-span-4",
          detailOpenOnMobile && "hidden lg:block"
        )}
      >
        <ClientsList
          clients={initialClients}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          now={now}
          isFiltering={isFiltering}
        />
      </div>

      <div
        className={cn(
          "lg:col-span-7 xl:col-span-8",
          !detailOpenOnMobile && "hidden lg:block"
        )}
      >
        <ClientDetailPanel
          selectedKey={selectedKey}
          onBack={() => setSelectedKey(null)}
        />
      </div>
    </div>
  );
}
