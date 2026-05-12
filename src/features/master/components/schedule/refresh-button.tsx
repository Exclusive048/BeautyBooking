"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.schedule.controls;

/**
 * Manual refresh trigger in the page header. Shows a spinning loader
 * while the next server render is in-flight, then snaps back to the icon.
 * Until SSE is wired up this is the only "live" affordance the master has.
 */
export function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimisticBusy, setOptimisticBusy] = useState(false);
  const busy = isPending || optimisticBusy;

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      aria-label={T.refresh}
      title={T.refresh}
      disabled={busy}
      onClick={() => {
        setOptimisticBusy(true);
        startTransition(() => {
          router.refresh();
          // Clear the optimistic flag on the next tick — by then
          // useTransition's pending state has taken over.
          setTimeout(() => setOptimisticBusy(false), 50);
        });
      }}
      className="h-9 w-9 rounded-xl"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <RefreshCw className="h-4 w-4" aria-hidden />
      )}
    </Button>
  );
}
