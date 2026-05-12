"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.portfolioPage.card;
const E = UI_TEXT.cabinetMaster.portfolioPage.reorder;

type Props = {
  itemId: string;
  isFirst: boolean;
  isLast: boolean;
};

/**
 * Two arrow buttons stacked on a card's bottom-left corner. Hits the
 * `/api/master/portfolio/reorder` endpoint with `direction: up | down`
 * — the server swaps `sortOrder` with the adjacent item under
 * Serializable isolation, so two quick clicks never cross-fade.
 *
 * Disabled at the boundary (first → up; last → down) so we don't even
 * fire requests that the server would no-op.
 */
export function ReorderControls({ itemId, isFirst, isLast }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<"up" | "down" | null>(null);

  const handleMove = async (direction: "up" | "down") => {
    if (pending) return;
    setPending(direction);
    try {
      const response = await fetch("/api/master/portfolio/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, direction }),
      });
      if (!response.ok) {
        window.alert(E.errorMessage);
        return;
      }
      router.refresh();
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="absolute bottom-2 left-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <ArrowButton
        disabled={isFirst || pending !== null}
        onClick={() => handleMove("up")}
        ariaLabel={T.moveUpAria}
      >
        <ArrowUp className="h-3.5 w-3.5" aria-hidden />
      </ArrowButton>
      <ArrowButton
        disabled={isLast || pending !== null}
        onClick={() => handleMove("down")}
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
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md bg-bg-card/95 text-text-main shadow-card transition-colors",
        "hover:bg-bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        "disabled:cursor-not-allowed disabled:opacity-30"
      )}
    >
      {children}
    </button>
  );
}
