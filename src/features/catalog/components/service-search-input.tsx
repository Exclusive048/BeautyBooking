"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Palette, Search, Star, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/cn";
import { formatReviews } from "@/lib/utils/pluralize-reviews";
import { fetchJson } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { UI_FMT } from "@/lib/ui/fmt";
import { Input } from "@/components/ui/input";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

export type AutocompleteCategory = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
};

export type AutocompleteProvider = {
  // SEC-12: `id` (сырой CUID провайдера) из ответа убран — потребителя у него
  // не было, переход идёт по `publicUsername`.
  name: string;
  publicUsername: string | null;
  type: "master" | "studio";
  ratingAvg: number;
  ratingCount: number;
  avatarUrl: string | null;
};

type AutocompleteResponse = {
  categories: AutocompleteCategory[];
  providers: AutocompleteProvider[];
};

type Props = {
  /** Current search-input value, lifted to the orchestrator so it can be cleared on filter changes. */
  value: string;
  onChange: (next: string) => void;
  /** Free-text submit (Enter / Найти button outside) — orchestrator applies as `serviceQuery` filter. */
  onSubmit: () => void;
  /** Click on a category in the dropdown — orchestrator should clear `value` AND apply the category filter. */
  onCategorySelect: (category: AutocompleteCategory) => void;
  /** Optional city slug to scope provider results — when set the endpoint filters providers by `city.slug`. */
  citySlug?: string | null;
  className?: string;
  /**
   * `bare` — прозрачное поле внутри общей карточки поиска (десктоп).
   * `field` — самостоятельная пилюля с собственной рамкой и заливкой
   * (компактная шапка каталога на телефоне).
   */
  appearance?: "bare" | "field";
  /** Действие справа в поле, пока в нём пусто (например, поиск по фото). */
  trailingAction?: ReactNode;
};

const T = UI_TEXT.catalog2.searchAutocomplete;

/**
 * Catalog search input with grouped autocomplete (categories + providers).
 *
 * - Debounced 300ms
 * - Min 2 chars before fetching
 * - Click on category → clears input via `onCategorySelect` callback (orchestrator owns clearing)
 * - Click on provider → navigates to `/u/{publicUsername}` and clears input locally
 * - Free-text Enter still calls `onSubmit` so the legacy serviceQuery flow keeps working
 *
 * The component is "transparent" — no border or background — designed to
 * sit inside the unified `<CatalogSearchBar>` card.
 */
export function ServiceSearchInput({
  value,
  onChange,
  onSubmit,
  onCategorySelect,
  citySlug,
  className,
  appearance = "bare",
  trailingAction,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AutocompleteResponse>({
    categories: [],
    providers: [],
  });
  const containerRef = useRef<HTMLDivElement | null>(null);

  const debouncedQuery = useDebouncedValue(value.trim(), DEBOUNCE_MS);

  // Click-outside dismissal — same pattern used in filter-chips. Listens at
  // document level only while the panel is open.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      const target = event.target;
      if (target instanceof Node && !containerRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // Debounced fetch. The `cancelled` flag protects against stale responses
  // overwriting fresher state when the user types quickly. When the query
  // drops below the minimum length we just skip — `dropdownVisible` already
  // gates rendering of any leftover results, so there's no need to wipe
  // state here (which would trip react-hooks/set-state-in-effect).
  useEffect(() => {
    if (debouncedQuery.length < MIN_QUERY_LENGTH) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: spinner reflects in-flight network state for the debounced query
    setLoading(true);

    const params = new URLSearchParams({ q: debouncedQuery });
    if (citySlug) params.set("citySlug", citySlug);

    // Подсказки поиска: отказ — пустой список, поиск по Enter работает и так.
    fetchJson<AutocompleteResponse>(`/api/catalog/autocomplete?${params.toString()}`, { cache: "no-store" })
      .then((data) => {
        if (cancelled) return;
        setResults(data);
        setOpen(true);
      })
      .catch(() => {
        if (!cancelled) setResults({ categories: [], providers: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, citySlug]);

  const handleCategoryClick = (category: AutocompleteCategory) => {
    onCategorySelect(category);
    onChange("");
    setOpen(false);
  };

  const handleProviderClick = (provider: AutocompleteProvider) => {
    onChange("");
    setOpen(false);
    if (provider.publicUsername) {
      router.push(`/u/${provider.publicUsername}`);
    }
  };

  const hasResults = results.categories.length > 0 || results.providers.length > 0;
  const showEmpty =
    !loading && debouncedQuery.length >= MIN_QUERY_LENGTH && !hasResults;
  const dropdownVisible = open && debouncedQuery.length >= MIN_QUERY_LENGTH;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec"
      />
      <Input
        ref={inputRef}
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (e.target.value.trim().length >= MIN_QUERY_LENGTH) setOpen(true);
        }}
        onFocus={() => {
          if (value.trim().length >= MIN_QUERY_LENGTH) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setOpen(false);
            onSubmit();
            // На телефоне «Найти» на клавиатуре обязано её убрать — иначе
            // клавиатура закрывает половину выдачи, которую пользователь
            // только что запросил.
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={UI_TEXT.catalog2.searchBar.searchPlaceholder}
        aria-label={UI_TEXT.catalog2.searchBar.searchPlaceholder}
        // 29.09 · 22: «поле» — общий вид `Input` (рамка и фокус `lux-input`),
        // «в шапке» — поле без своей рамки внутри строки поиска.
        variant={appearance === "field" ? "default" : "bare"}
        className={cn(
          "pl-9 text-base transition-shadow",
          appearance === "field" ? "rounded-full pr-11" : "rounded-xl pr-9 focus:ring-2 focus:ring-primary/30",
        )}
      />

      {loading ? (
        <Loader2
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-sec",
            appearance === "field" && value ? "right-11" : "right-3",
          )}
        />
      ) : null}

      {appearance === "field" ? (
        <div className="absolute right-0.5 top-1/2 -translate-y-1/2">
          {value ? (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-text-sec hover:text-text-main"
              aria-label={UI_TEXT.catalog2.searchBar.clearAria}
              onClick={() => {
                onChange("");
                setOpen(false);
                inputRef.current?.focus();
              }}
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          ) : loading ? null : (
            trailingAction
          )}
        </div>
      ) : null}

      {dropdownVisible ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[420px] overflow-hidden rounded-2xl border border-border-subtle bg-bg-card shadow-card">
          <div className="max-h-[420px] overflow-y-auto">
            {results.categories.length > 0 ? (
              <div className="p-2">
                <div className="px-2 pb-1 pt-1.5 eyebrow font-medium">
                  {T.categoriesGroup}
                </div>
                {results.categories.map((cat) => (
                  <Button variant="wrapper"
                    key={cat.id}
                    onClick={() => handleCategoryClick(cat)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-bg-input/70"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-accent-text">
                      <Palette className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="text-sm text-text-main">{cat.name}</span>
                  </Button>
                ))}
              </div>
            ) : null}

            {results.providers.length > 0 ? (
              <div
                className={cn(
                  "p-2",
                  results.categories.length > 0 ? "border-t border-border-subtle/50" : "",
                )}
              >
                <div className="px-2 pb-1 pt-1.5 eyebrow font-medium">
                  {T.providersGroup}
                </div>
                {results.providers.map((p) => (
                  <Button variant="wrapper"
                    // SEC-12: id из ответа убран; `publicUsername` уникален, а
                    // индекс страхует провайдера без него (кнопка disabled).
                    key={p.publicUsername ?? `provider-${p.name}`}
                    onClick={() => handleProviderClick(p)}
                    disabled={!p.publicUsername}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-bg-input/70 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {/* UI-10: иконка брала ЗАЛИВОЧНЫЙ `primary-magenta` как
                        цвет переднего плана — 2.89:1 в тёмной теме. Сосед на
                        30 строк выше (`bg-primary/10 text-accent-text`) уже
                        держит санкционированный раскол, так что здесь не новое
                        решение, а выравнивание отставшей плашки: 10.30 / 6.27.
                        Различает секции подложка и сама иконка, не её цвет. */}
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-magenta/10 text-accent-text">
                      {p.type === "studio" ? (
                        <Building2 className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <User className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-text-main">{p.name}</div>
                      {p.ratingCount > 0 ? (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-text-sec">
                          <Star className="h-3 w-3 fill-rating text-rating" aria-hidden />
                          <span className="tabular-nums">{UI_FMT.decimal(p.ratingAvg, 1)}</span>
                          <span aria-hidden>·</span>
                          <span className="tabular-nums">{formatReviews(p.ratingCount)}</span>
                        </div>
                      ) : null}
                    </div>
                  </Button>
                ))}
              </div>
            ) : null}

            {showEmpty ? (
              <div className="px-4 py-6 text-center text-sm text-text-sec">
                {T.empty.replace("{query}", debouncedQuery)}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
