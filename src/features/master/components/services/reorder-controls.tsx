"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";

const T = UI_TEXT.cabinetMaster.servicesPage.row;
const E = UI_TEXT.cabinetMaster.servicesPage.reorder;

type Props = {
  itemId: string;
  /** Endpoint expects `{itemId, direction}` payload. */
  endpoint: "/api/master/services/reorder" | "/api/master/service-packages/reorder";
  isFirst: boolean;
  isLast: boolean;
};

export function ReorderControls({ itemId, endpoint, isFirst, isLast }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<"up" | "down" | null>(null);

  const move = async (direction: "up" | "down") => {
    if (pending) return;
    setPending(direction);
    try {
      await fetchJsonWithAuth<unknown>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, direction }),
      });
      router.refresh();
    } catch (error) {
      toast.error(serverMessageOr(error, E.errorMessage));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <ArrowButton
        disabled={isFirst || pending !== null}
        onClick={() => move("up")}
        ariaLabel={T.moveUpAria}
      >
        <ArrowUp className="h-3.5 w-3.5" aria-hidden />
      </ArrowButton>
      <ArrowButton
        disabled={isLast || pending !== null}
        onClick={() => move("down")}
        ariaLabel={T.moveDownAria}
      >
        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
      </ArrowButton>
    </div>
  );
}

function ArrowButton({
  disabled,
  onClick,
  ariaLabel,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Button variant="wrapper"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded text-text-sec transition-colors",
        "hover:bg-bg-input hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        "disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      )}
    >
      {children}
    </Button>
  );
}
