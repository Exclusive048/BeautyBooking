"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  providerId: string;
  /** Initial state from the server. Optimistic toggles roll back on failure. */
  initialFavorited?: boolean;
  /** Required: false ↔ guest. On click we redirect to /login. */
  isAuthenticated: boolean;
  /** Visual variant. `floating` for absolute overlay on photos, `pill` for inline. */
  variant?: "floating" | "pill";
  className?: string;
};

/**
 * Shared favorite toggle. Backs onto POST /api/favorites/toggle with optimistic
 * UI + roll-back on non-2xx. Authenticated state is required upfront (the
 * server has it via session); guest clicks bounce to /login to avoid silent
 * no-ops. Used on catalog cards (via `CatalogCard`), public profile hero,
 * and booking widget hero — keep one component so behaviour stays consistent
 * across surfaces.
 */
export function FavoriteToggleButton({
  providerId,
  initialFavorited = false,
  isAuthenticated,
  variant = "floating",
  className,
}: Props) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, setPending] = useState(false);

  async function toggle(e: React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      router.push("/login?next=" + encodeURIComponent(window.location.pathname));
      return;
    }
    if (pending) return;
    const next = !favorited;
    setFavorited(next);
    setPending(true);
    try {
      const res = await fetch("/api/favorites/toggle", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setFavorited(!next);
        return;
      }
      if (typeof json.data?.favorited === "boolean") {
        setFavorited(json.data.favorited);
      }
    } catch {
      setFavorited(!next);
    } finally {
      setPending(false);
    }
  }

  const base =
    variant === "floating"
      ? "grid h-10 w-10 place-items-center rounded-full bg-bg-card/85 text-text-sec shadow-card backdrop-blur transition hover:bg-bg-card hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-glow/45"
      : "inline-flex h-10 items-center gap-1.5 rounded-2xl border border-border-subtle/80 bg-bg-input px-3 text-sm font-medium text-text-main hover:border-border-subtle hover:bg-bg-card";

  return (
    <button
      type="button"
      aria-pressed={favorited}
      aria-label={UI_TEXT.publicProfile.hero.favorite}
      onClick={toggle}
      disabled={pending}
      className={`${base} ${className ?? ""}`}
    >
      <Heart
        className={`h-4 w-4 transition ${
          favorited ? "fill-primary text-primary" : ""
        }`}
        aria-hidden
      />
      {variant === "pill" ? (
        <span>{UI_TEXT.publicProfile.hero.favorite}</span>
      ) : null}
    </button>
  );
}
