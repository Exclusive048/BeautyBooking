"use client";

import { Pencil } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import { SaveStatusChip } from "./save-status-chip";
import { useAutosave } from "./use-autosave";

const T_EDIT = UI_TEXT.cabinetMaster.profile.editable;
const T_LOC = UI_TEXT.cabinetMaster.profile.location;

type Props = {
  /** Current saved address. */
  value: string;
};

type Suggestion = { value: string };

const SUGGEST_DEBOUNCE_MS = 220;

/**
 * Address editor with Yandex Suggest dropdown. Selecting a suggestion
 * triggers a geocode lookup, then PATCHes `address` + `geoLat` +
 * `geoLng` together. The server's `updateMasterProfile` re-runs its own
 * geocoder authoritatively and resolves `cityId` — we just need to
 * supply non-empty coords to satisfy the route's
 * `ADDRESS_COORDS_REQUIRED` precondition.
 *
 * Free-form Enter (without a suggestion) won't save — we require the
 * user to pick from the suggest list so geocoding is always reliable.
 */
export function AddressEditor({ value }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const fetchSeqRef = useRef(0);
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    if (!isEditing) setDraft(value);
  }

  const autosave = useAutosave<{ address: string; lat: number; lng: number }>(
    async (next) => {
      const response = await fetch("/api/master/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: next.address,
          geoLat: next.lat,
          geoLng: next.lng,
        }),
      });
      if (!response.ok) return { ok: false };
      return { ok: true };
    },
    { isEqual: (a, b) => a.address === b.address && a.lat === b.lat && a.lng === b.lng }
  );

  useEffect(() => {
    return () => {
      if (fetchTimerRef.current) {
        clearTimeout(fetchTimerRef.current);
      }
    };
  }, []);

  const enterEdit = () => {
    if (isEditing) return;
    setDraft(value);
    setIsEditing(true);
    setOpen(true);
    queueMicrotask(() => inputRef.current?.focus());
  };

  const exitEdit = () => {
    setOpen(false);
    setIsEditing(false);
    setSuggestions([]);
  };

  const scheduleSuggest = (query: string) => {
    if (fetchTimerRef.current) {
      clearTimeout(fetchTimerRef.current);
      fetchTimerRef.current = null;
    }
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const seq = ++fetchSeqRef.current;
    fetchTimerRef.current = setTimeout(() => {
      void fetch(`/api/address/suggest?q=${encodeURIComponent(query.trim())}&limit=6`)
        .then((response) => response.json())
        .then((json) => {
          if (seq !== fetchSeqRef.current) return;
          if (json?.ok && Array.isArray(json.data?.suggestions)) {
            setSuggestions(json.data.suggestions as Suggestion[]);
          } else {
            setSuggestions([]);
          }
        })
        .catch(() => {
          if (seq === fetchSeqRef.current) setSuggestions([]);
        });
    }, SUGGEST_DEBOUNCE_MS);
  };

  const pickSuggestion = async (suggestion: Suggestion) => {
    setDraft(suggestion.value);
    setOpen(false);
    setSuggestions([]);
    // Geocode the picked address; server PATCH then re-geocodes
    // authoritatively but needs *some* lat/lng to satisfy the route.
    const coords = await geocodeAddress(suggestion.value);
    if (!coords) {
      // Server will re-geocode anyway, but the route expects coords
      // for non-empty addresses. We zero them out and let the server
      // resolve — when it succeeds, the response refresh updates the
      // map; when it fails, the page-level banner already covers that.
      await autosave.flush({ address: suggestion.value, lat: 0, lng: 0 });
    } else {
      await autosave.flush({
        address: suggestion.value,
        lat: coords.lat,
        lng: coords.lng,
      });
    }
    setIsEditing(false);
    // Refresh server state — `getMasterProfileView` will pick up the
    // new cityId/coords for the map render.
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(value);
      exitEdit();
    }
  };

  const isEmpty = !value || value.trim().length === 0;

  return (
    <div className="group flex items-start gap-3 border-b border-border-subtle py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <label
            htmlFor={inputId}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec"
          >
            {T_LOC.addressLabel}
          </label>
          <SaveStatusChip status={autosave.status} />
        </div>
        {isEditing ? (
          <div className="relative mt-1">
            <input
              id={inputId}
              ref={inputRef}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setOpen(true);
                scheduleSuggest(event.target.value);
              }}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                // Delay to allow click on suggestion to register first.
                setTimeout(() => setOpen(false), 150);
              }}
              placeholder={T_LOC.addressPlaceholder}
              className="block w-full border-0 border-b-2 border-primary bg-transparent py-1 text-sm text-text-main outline-none focus:ring-0"
            />
            {open && suggestions.length > 0 ? (
              <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-border-subtle bg-bg-card py-1 shadow-card">
                {suggestions.map((suggestion, index) => (
                  <li key={`${suggestion.value}-${index}`}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => void pickSuggestion(suggestion)}
                      className="block w-full px-3 py-2 text-left text-sm text-text-main hover:bg-bg-input"
                    >
                      {suggestion.value}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {open && suggestions.length === 0 && draft.trim().length >= 2 ? (
              <p className="mt-1 text-xs text-text-sec">{T_LOC.addressSuggestEmpty}</p>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={enterEdit}
            className={cn(
              "mt-1 block w-full text-left text-sm",
              isEmpty ? "italic text-text-sec" : "text-text-main"
            )}
          >
            {isEmpty ? T_EDIT.emptyValue : value}
          </button>
        )}
      </div>
      {!isEditing ? (
        <button
          type="button"
          onClick={enterEdit}
          aria-label={T_EDIT.editAriaLabel}
          className="mt-2 shrink-0 rounded-md p-1.5 text-text-sec opacity-0 transition-opacity hover:text-primary group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const response = await fetch(`/api/address/geocode?q=${encodeURIComponent(query)}`);
    if (!response.ok) return null;
    const json = await response.json();
    if (json?.ok && json.data?.coords) {
      return json.data.coords as { lat: number; lng: number };
    }
    return null;
  } catch {
    return null;
  }
}
