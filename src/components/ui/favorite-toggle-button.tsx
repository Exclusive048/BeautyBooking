"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

/**
 * Кого добавляем: внутренний `providerId` (кабинет/публичный профиль, где он уже
 * разрешён на сервере) ЛИБО публичный `providerUsername` (лента главной —
 * rule 12, внутренних id в ней нет). Роут принимает оба.
 */
type ProviderRef =
  | { providerId: string; providerUsername?: never }
  | { providerUsername: string; providerId?: never };

type Props = ProviderRef & {
  /** Initial state from the server. Optimistic toggles roll back on failure. */
  initialFavorited?: boolean;
  /**
   * HOME-FEED-COLLAGE: управляемый режим. Когда у одного автора на экране
   * несколько кнопок (его плитки в ленте), состояние держит родитель — иначе
   * после нажатия на одной плитке соседние показывали бы прежнее.
   */
  favorited?: boolean;
  onFavoritedChange?: (next: boolean) => void;
  /** Required: false ↔ guest. On click we redirect to /login. */
  isAuthenticated: boolean;
  /**
   * `floating` — плотный кружок поверх фото, `pill` — в строке, `glass` —
   * полупрозрачный кружок поверх фото (плитки ленты: не спорит с работой).
   */
  variant?: "floating" | "pill" | "glass";
  className?: string;
};

/**
 * Shared favorite toggle. Backs onto POST /api/favorites/toggle with optimistic
 * UI + roll-back on non-2xx. Authenticated state is required upfront (the
 * server has it via session); guest clicks bounce to /login to avoid silent
 * no-ops. Used on catalog cards (via `CatalogCard`), public profile hero,
 * booking widget hero and home feed tiles — keep one component so behaviour
 * stays consistent across surfaces.
 */
export function FavoriteToggleButton({
  providerId,
  providerUsername,
  initialFavorited = false,
  favorited: controlledFavorited,
  onFavoritedChange,
  isAuthenticated,
  variant = "floating",
  className,
}: Props) {
  const router = useRouter();
  const [ownFavorited, setOwnFavorited] = useState(initialFavorited);
  const [pending, setPending] = useState(false);
  const favorited = controlledFavorited ?? ownFavorited;

  const setFavorited = (next: boolean) => {
    setOwnFavorited(next);
    onFavoritedChange?.(next);
  };

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
        body: JSON.stringify(providerId ? { providerId } : { providerUsername }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setFavorited(!next);
        return;
      }
      if (typeof json.data?.favorited === "boolean" && json.data.favorited !== next) {
        setFavorited(json.data.favorited);
      }
    } catch {
      setFavorited(!next);
    } finally {
      setPending(false);
    }
  }

  if (variant === "glass") {
    // Зона нажатия 40px, видимый кружок меньше: на плитке шириной ~110px
    // (3 колонки на телефоне) полноразмерная кнопка закрывала бы работу.
    return (
      <button
        type="button"
        aria-pressed={favorited}
        aria-label={UI_TEXT.publicProfile.hero.favorite}
        onClick={toggle}
        disabled={pending}
        className={cn(
          "group/fav grid h-10 w-10 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
          className,
        )}
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-black/20 text-white ring-1 ring-white/30 backdrop-blur-sm transition group-hover/fav:bg-black/35 sm:h-8 sm:w-8">
          <Heart
            className={cn("h-3.5 w-3.5 transition sm:h-4 sm:w-4", favorited && "fill-current")}
            aria-hidden
          />
        </span>
      </button>
    );
  }

  const base =
    variant === "floating"
      ? "grid h-10 w-10 place-items-center rounded-full bg-bg-card/85 text-text-sec shadow-card backdrop-blur transition hover:bg-bg-card hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-glow/45"
      : "inline-flex h-10 items-center gap-1.5 rounded-2xl border border-border-control bg-bg-input px-3 text-sm font-medium text-text-main hover:bg-bg-card";

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
          favorited ? "fill-primary text-accent-text" : ""
        }`}
        aria-hidden
      />
      {variant === "pill" ? (
        <span>{UI_TEXT.publicProfile.hero.favorite}</span>
      ) : null}
    </button>
  );
}
