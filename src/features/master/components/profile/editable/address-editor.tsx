"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fetchJson, fetchJsonWithAuth, serverMessageOf, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { SaveStatusChip } from "./save-status-chip";
import { useAutosave } from "./use-autosave";
import { Button } from "@/components/ui/button";
import { InlineEditField, InlineEditInput, InlineEditPencil } from "@/components/ui/inline-edit";

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
 *
 * PWA-RELOAD-01 — после сохранения обновляется серверное дерево
 * (`router.refresh()`), а не вся страница: прежний `window.location.reload()`
 * сбрасывал скролл и перерисовывал кабинет целиком. Режим просмотра печатает
 * `savedValue` (optimistic, образец — `EditableFieldRow`), иначе до прихода
 * обновлённого дерева строка мигала бы старым адресом.
 */
export function AddressEditor({ value }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  /** Что показывает режим просмотра (optimistic, см. док-блок выше). */
  const [savedValue, setSavedValue] = useState(value);
  /** Последний подтверждённый сервером адрес — точка отката при отказе. */
  const confirmedRef = useRef(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  /** Отказ подсказок (лимит 429 / сервис недоступен 503) — дословно (29.09 · 11). */
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const fetchSeqRef = useRef(0);
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setSavedValue(value);
    if (!isEditing) setDraft(value);
  }

  useEffect(() => {
    confirmedRef.current = value;
  }, [value]);

  const autosave = useAutosave<{ address: string; lat: number; lng: number }>(
    async (next) => {
      try {
        await fetchJsonWithAuth<unknown>("/api/master/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: next.address,
            geoLat: next.lat,
            geoLng: next.lng,
          }),
        });
      } catch (error) {
        // Откат оптимистичного адреса; содержательный отказ сервера — дословно,
        // иначе чип напечатает канон.
        setSavedValue(confirmedRef.current);
        return { ok: false, message: serverMessageOf(error) };
      }
      confirmedRef.current = next.address;
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
    setDraft(savedValue);
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
      setSuggestError(null);
      return;
    }
    const seq = ++fetchSeqRef.current;
    fetchTimerRef.current = setTimeout(() => {
      void fetchJson<{ suggestions?: Suggestion[] }>(
        `/api/address/suggest?q=${encodeURIComponent(query.trim())}&limit=6`,
      )
        .then((data) => {
          if (seq !== fetchSeqRef.current) return;
          setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
          setSuggestError(null);
        })
        .catch((error: unknown) => {
          if (seq !== fetchSeqRef.current) return;
          setSuggestions([]);
          // 429 «подождите» и 503 «сервис недоступен» — разные советы, оба
          // видны при вводе; обрыв сети — своя строка.
          setSuggestError(serverMessageOr(error, T_LOC.addressSuggestFailed));
        });
    }, SUGGEST_DEBOUNCE_MS);
  };

  const pickSuggestion = async (suggestion: Suggestion) => {
    setDraft(suggestion.value);
    setSavedValue(suggestion.value);
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
    startTransition(() => router.refresh());
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(savedValue);
      exitEdit();
    }
  };

  const isEmpty = !savedValue || savedValue.trim().length === 0;

  return (
    <div className="group flex items-start gap-3 border-b border-border-subtle py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <label
            htmlFor={inputId}
            className="eyebrow"
          >
            {T_LOC.addressLabel}
          </label>
          <SaveStatusChip status={autosave.status} />
        </div>
        {isEditing ? (
          <div className="relative mt-1">
            <InlineEditInput underline="focus"
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
              // UI-32: подчёркивание — само по себе индикатор фокуса, поэтому
              // оно зависит от фокуса. В отличие от соседних inline-edit строк
              // это поле НЕ уходит из режима правки по blur (его закрывает
              // только выбор подсказки, Escape или сохранение), то есть оно
              // может стоять расфокусированным на экране — а сплошной primary
              // выглядел одинаково и с фокусом, и без.
              
            />
            {open && suggestions.length > 0 ? (
              <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-border-subtle bg-bg-card py-1 shadow-card">
                {suggestions.map((suggestion, index) => (
                  <li key={`${suggestion.value}-${index}`}>
                    <Button variant="wrapper"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => void pickSuggestion(suggestion)}
                      className="block w-full px-3 py-2 text-left text-sm text-text-main hover:bg-bg-input"
                    >
                      {suggestion.value}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            {open && suggestError ? (
              <p role="alert" className="mt-1 text-xs text-danger-text">
                {suggestError}
              </p>
            ) : open && suggestions.length === 0 && draft.trim().length >= 2 ? (
              <p className="mt-1 text-xs text-text-sec">{T_LOC.addressSuggestEmpty}</p>
            ) : null}
          </div>
        ) : (
          <InlineEditField
            onClick={enterEdit}
            empty={isEmpty}
            className="mt-1"
          >
            {isEmpty ? T_EDIT.emptyValue : savedValue}
          </InlineEditField>
        )}
        {autosave.errorMessage ? (
          <p role="alert" className="mt-1 text-xs text-danger-text">
            {autosave.errorMessage}
          </p>
        ) : null}
      </div>
      {!isEditing ? (
        <InlineEditPencil
          onClick={enterEdit}
          aria-label={T_EDIT.editAriaLabel}
          className="mt-2"
        />
      ) : null}
    </div>
  );
}

async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  // Тихо осознанно: сервер при сохранении геокодирует адрес сам и отвечает за
  // итог — его отказ дойдёт через чип автосохранения.
  try {
    const data = await fetchJson<{ coords?: { lat: number; lng: number } | null }>(
      `/api/address/geocode?q=${encodeURIComponent(query)}`,
    );
    return data?.coords ?? null;
  } catch {
    return null;
  }
}
