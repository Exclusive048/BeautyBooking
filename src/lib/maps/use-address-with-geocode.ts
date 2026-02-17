"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";

export type AddressCoords = { lat: number; lng: number };
export type GeoStatus = "idle" | "resolving" | "error";
export type AddressSource = "manual" | "suggest";
export type AddressStatusTone = "muted" | "success" | "error";
export type AddressStatus = { text: string; tone: AddressStatusTone };
export type AddressSuggestion = { value: string };

export const COORDS_ERROR_MESSAGE =
  "Не удалось определить координаты. Выберите адрес из подсказок.";
export const SUGGEST_UNAVAILABLE_MESSAGE =
  "Подсказки адреса недоступны. Проверьте ключ Яндекс.Карт.";
export const ADDRESS_PICK_HINT =
  "Выберите адрес из подсказок, чтобы определить координаты";
export const ADDRESS_RESOLVING_MESSAGE = "Определяем координаты...";
export const ADDRESS_CONFIRMED_MESSAGE = "✓ Адрес подтверждён";

type AddressSnapshot = {
  text: string;
  coords: AddressCoords | null;
};

const SUGGEST_DEBOUNCE_MS = 250;
const MIN_SUGGEST_LENGTH = 2;
const SUGGEST_LIMIT = 6;

function isValidCoords(value: AddressCoords | null): value is AddressCoords {
  return Boolean(
    value &&
      Number.isFinite(value.lat) &&
      Number.isFinite(value.lng)
  );
}

export function useAddressWithGeocode() {
  const [addressText, setAddressText] = useState("");
  const [addressCoords, setAddressCoords] = useState<AddressCoords | null>(null);
  const [addressSource, setAddressSource] = useState<AddressSource>("manual");
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSuggestOpen, setIsSuggestOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const suggestRequestIdRef = useRef(0);
  const geocodeRequestIdRef = useRef(0);
  const debounceRef = useRef<number | null>(null);
  const suggestAbortRef = useRef<AbortController | null>(null);
  const geocodeAbortRef = useRef<AbortController | null>(null);
  const manualInputRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      suggestAbortRef.current?.abort();
      geocodeAbortRef.current?.abort();
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const inputRef = useCallback((node: HTMLInputElement | HTMLTextAreaElement | null) => {
    void node;
  }, []);

  const setSuggestOpen = useCallback((open: boolean) => {
    setIsSuggestOpen(open);
    if (!open) {
      setActiveIndex(-1);
    }
  }, []);

  const closeSuggest = useCallback(() => {
    setSuggestOpen(false);
  }, [setSuggestOpen]);

  const resetSuggestions = useCallback(() => {
    setSuggestions([]);
    setSuggestLoading(false);
    setSuggestOpen(false);
  }, [setSuggestOpen]);

  const setAddressSnapshot = useCallback((snapshot: AddressSnapshot) => {
    manualInputRef.current = false;
    geocodeRequestIdRef.current += 1;
    geocodeAbortRef.current?.abort();
    setAddressText(snapshot.text);
    setAddressCoords(snapshot.coords);
    setAddressSource("manual");
    setGeoStatus("idle");
    setSuggestError(null);
    resetSuggestions();
  }, [resetSuggestions]);

  const handleAddressChange = useCallback((value: string) => {
    manualInputRef.current = true;
    suggestRequestIdRef.current += 1;
    geocodeRequestIdRef.current += 1;
    suggestAbortRef.current?.abort();
    geocodeAbortRef.current?.abort();
    setAddressText(value);
    setAddressCoords(null);
    setAddressSource("manual");
    setGeoStatus("idle");
    setSuggestError(null);
    resetSuggestions();
  }, [resetSuggestions]);

  const resolveAddressCoordinates = useCallback(
    async (value: string, signal: AbortSignal): Promise<AddressCoords | null> => {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const params = new URLSearchParams({ q: trimmed });
      const res = await fetch(`/api/address/geocode?${params.toString()}`, {
        cache: "no-store",
        signal,
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ coords: AddressCoords | null }>
        | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error("Geocode failed");
      }
      const coords = json.data.coords;
      if (
        !coords ||
        !Number.isFinite(coords.lat) ||
        !Number.isFinite(coords.lng)
      ) {
        return null;
      }
      return { lat: coords.lat, lng: coords.lng };
    },
    []
  );

  const selectSuggestion = useCallback(
    (item: AddressSuggestion) => {
      const selected = item.value.trim();
      if (!selected) return;

      manualInputRef.current = false;
      setAddressText(selected);
      setAddressSource("suggest");
      setAddressCoords(null);
      setGeoStatus("resolving");
      setSuggestError(null);
      suggestRequestIdRef.current += 1;
      suggestAbortRef.current?.abort();
      resetSuggestions();

      geocodeAbortRef.current?.abort();
      const controller = new AbortController();
      geocodeAbortRef.current = controller;
      const requestId = (geocodeRequestIdRef.current += 1);

      void (async () => {
        try {
          const coords = await resolveAddressCoordinates(selected, controller.signal);
          if (controller.signal.aborted) return;
          if (geocodeRequestIdRef.current !== requestId) return;
          if (!isMountedRef.current) return;

          if (!coords) {
            setAddressCoords(null);
            setGeoStatus("error");
            return;
          }
          setAddressCoords(coords);
          setGeoStatus("idle");
        } catch {
          if (controller.signal.aborted) return;
          if (geocodeRequestIdRef.current !== requestId) return;
          if (!isMountedRef.current) return;
          setAddressCoords(null);
          setGeoStatus("error");
        }
      })();
    },
    [resetSuggestions, resolveAddressCoordinates]
  );

  useEffect(() => {
    const trimmed = addressText.trim();
    if (!manualInputRef.current) return;
    if (addressSource !== "manual") return;
    if (trimmed.length < MIN_SUGGEST_LENGTH) return;

    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      suggestAbortRef.current?.abort();
      const controller = new AbortController();
      suggestAbortRef.current = controller;
      const requestId = (suggestRequestIdRef.current += 1);
      setSuggestLoading(true);

      void (async () => {
        try {
          const params = new URLSearchParams({
            q: trimmed,
            limit: String(SUGGEST_LIMIT),
          });
          const res = await fetch(`/api/address/suggest?${params.toString()}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          const json = (await res.json().catch(() => null)) as
            | ApiResponse<{ suggestions: AddressSuggestion[] }>
            | null;
          if (!res.ok || !json || !json.ok) {
            throw new Error("Suggest failed");
          }
          if (controller.signal.aborted) return;
          if (suggestRequestIdRef.current !== requestId) return;
          if (!isMountedRef.current) return;

          const items = Array.isArray(json.data.suggestions) ? json.data.suggestions : [];
          const normalized = items
            .map((item) => ({
              value: typeof item?.value === "string" ? item.value.trim() : "",
            }))
            .filter((item) => item.value.length > 0)
            .slice(0, SUGGEST_LIMIT);
          setSuggestions(normalized);
          setActiveIndex(-1);
          setSuggestOpen(normalized.length > 0);
          setSuggestError(null);
        } catch {
          if (controller.signal.aborted) return;
          if (suggestRequestIdRef.current !== requestId) return;
          if (!isMountedRef.current) return;
          setSuggestions([]);
          setActiveIndex(-1);
          setSuggestOpen(false);
          setSuggestError(SUGGEST_UNAVAILABLE_MESSAGE);
        } finally {
          if (controller.signal.aborted) return;
          if (suggestRequestIdRef.current !== requestId) return;
          if (!isMountedRef.current) return;
          setSuggestLoading(false);
        }
      })();
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [addressSource, addressText, setSuggestOpen]);

  const addressStatus = useMemo<AddressStatus | null>(() => {
    const trimmed = addressText.trim();
    if (suggestError) {
      return { text: suggestError, tone: "error" };
    }
    if (geoStatus === "resolving") {
      return { text: ADDRESS_RESOLVING_MESSAGE, tone: "muted" };
    }
    if (geoStatus === "error") {
      return { text: COORDS_ERROR_MESSAGE, tone: "error" };
    }
    if (!trimmed) return null;
    if (isValidCoords(addressCoords)) {
      return { text: ADDRESS_CONFIRMED_MESSAGE, tone: "success" };
    }
    if (addressSource === "manual") {
      return { text: ADDRESS_PICK_HINT, tone: "muted" };
    }
    return null;
  }, [addressText, addressCoords, addressSource, geoStatus, suggestError]);

  return {
    inputRef,
    addressText,
    addressCoords,
    addressSource,
    geoStatus,
    addressStatus,
    suggestions,
    isSuggestOpen,
    setIsSuggestOpen: setSuggestOpen,
    selectSuggestion,
    closeSuggest,
    activeIndex,
    setActiveIndex,
    setAddressSnapshot,
    handleAddressChange,
    suggestLoading,
  };
}
