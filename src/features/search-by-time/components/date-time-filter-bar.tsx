"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimePresetChips, type TimePreset } from "@/features/search-by-time/components/time-preset-chips";
import type { ApiResponse } from "@/lib/types/api";
import type { ServiceSuggestResponse, ServiceSuggestion } from "@/lib/search-by-time/types";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  serviceQuery: string;
  serviceId: string;
  date: string;
  timePreset: TimePreset | null;
  timeFrom: string;
  timeTo: string;
  onServiceQueryChange: (value: string) => void;
  onServiceSelect: (service: ServiceSuggestion) => void;
  onDateChange: (value: string) => void;
  onPresetChange: (preset: Exclude<TimePreset, "custom">, timeFrom: string, timeTo: string) => void;
  onCustomTimeChange: (timeFrom: string, timeTo: string) => void;
  onClearTime: () => void;
  showPhotoSearch?: boolean;
  onOpenPhotoSearch: () => void;
  onSubmit: () => void;
};

const SUGGEST_DEBOUNCE_MS = 200;
const CUSTOM_DEFAULT_FROM = "09:00";
const CUSTOM_DEFAULT_TO = "12:00";

const PRESET_RANGES: Record<Exclude<TimePreset, "custom">, { from: string; to: string }> = {
  morning: { from: "09:00", to: "12:00" },
  day: { from: "12:00", to: "18:00" },
  evening: { from: "18:00", to: "22:00" },
};

export function DateTimeFilterBar({
  serviceQuery,
  serviceId,
  date,
  timePreset,
  timeFrom,
  timeTo,
  onServiceQueryChange,
  onServiceSelect,
  onDateChange,
  onPresetChange,
  onCustomTimeChange,
  onClearTime,
  showPhotoSearch = true,
  onOpenPhotoSearch,
  onSubmit,
}: Props) {
  const [suggestions, setSuggestions] = useState<ServiceSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const todayIso = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (timePreset === "custom") {
      setCustomOpen(true);
      return;
    }
    if (timePreset) {
      setCustomOpen(false);
      return;
    }
    if (timeFrom || timeTo) {
      setCustomOpen(true);
    }
  }, [timePreset, timeFrom, timeTo]);

  useEffect(() => {
    if (!suggestOpen) return;

    const onDocumentClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      const target = event.target;
      if (target instanceof Node && !rootRef.current.contains(target)) {
        setSuggestOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [suggestOpen]);

  useEffect(() => {
    if (!suggestOpen) return;
    const query = serviceQuery.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setSuggestLoading(false);
      return;
    }

    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSuggestLoading(true);
      (async () => {
        try {
          const params = new URLSearchParams({ q: query });
          const res = await fetch(`/api/search/services?${params.toString()}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          const json = (await res.json().catch(() => null)) as ApiResponse<ServiceSuggestResponse> | null;
          if (!res.ok || !json || !json.ok) {
            setSuggestions([]);
            return;
          }
          setSuggestions(json.data.items);
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setSuggestions([]);
        } finally {
          if (!controller.signal.aborted) {
            setSuggestLoading(false);
          }
        }
      })();
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [serviceQuery, suggestOpen]);

  return (
    <div className="glass-panel rounded-3xl p-4" ref={rootRef}>
      <div className="grid grid-cols-12 gap-3 md:items-center">
        <div className="relative col-span-12 md:col-span-6">
          <Input
            value={serviceQuery}
            onChange={(event) => onServiceQueryChange(event.target.value)}
            placeholder={UI_TEXT.catalog.capsule.servicePlaceholder}
            className="h-10 rounded-full bg-bg-input/90"
            aria-label={UI_TEXT.catalog.capsule.servicePlaceholder}
            onFocus={() => setSuggestOpen(true)}
          />
          {suggestOpen ? (
            <div className="absolute z-30 mt-2 w-full rounded-2xl border border-border-subtle bg-bg-card p-2 shadow-card">
              {suggestLoading ? (
                <div className="px-3 py-2 text-xs text-text-sec">{UI_TEXT.common.loading}</div>
              ) : suggestions.length > 0 ? (
                suggestions.map((item) => (
                  <Button
                    variant="ghost"
                    size="none"
                    key={item.id}
                    onClick={() => {
                      onServiceSelect(item);
                      setSuggestOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition hover:bg-bg-input ${
                      item.id === serviceId ? "bg-bg-input" : ""
                    }`}
                  >
                    <span>{item.title}</span>
                  </Button>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-text-sec">{UI_TEXT.catalog.timeSearch.noServices}</div>
              )}
            </div>
          ) : null}
        </div>

        <div className="col-span-12 md:col-span-3">
          <Input
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
            type="date"
            className="h-10 rounded-full bg-bg-input/90"
            aria-label={UI_TEXT.catalog.capsule.datePlaceholder}
          />
        </div>

        {showPhotoSearch ? (
          <div className="col-span-12 md:col-span-1">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-10 w-full rounded-full md:w-10"
              aria-label={UI_TEXT.home.visualSearch.button}
              title={UI_TEXT.home.visualSearch.button}
              onClick={onOpenPhotoSearch}
            >
              <Camera className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ) : null}

        <div className={showPhotoSearch ? "col-span-12 md:col-span-2" : "col-span-12 md:col-span-3"}>
          <Button type="button" onClick={onSubmit} className="h-10 w-full rounded-full px-5 text-sm">
            {UI_TEXT.catalog.capsule.find}
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="text-xs text-text-sec">{UI_TEXT.catalog.timeSearch.title}</div>
        <TimePresetChips
          value={timePreset}
          onChange={(value) => {
            if (value === null) {
              setCustomOpen(false);
              onClearTime();
              return;
            }
            if (value === "custom") {
              const nextFrom = timeFrom || CUSTOM_DEFAULT_FROM;
              const nextTo = timeTo || CUSTOM_DEFAULT_TO;
              setCustomOpen(true);
              if (!date) onDateChange(todayIso);
              onCustomTimeChange(nextFrom, nextTo);
              return;
            }
            const range = PRESET_RANGES[value];
            setCustomOpen(false);
            if (!date) onDateChange(todayIso);
            onPresetChange(value, range.from, range.to);
          }}
        />

        {customOpen ? (
          <div className="grid gap-2 md:grid-cols-[1fr_1fr]">
            <div>
              <label className="mb-1 block text-xs text-text-sec">{UI_TEXT.catalog.timeSearch.from}</label>
              <Input
                type="time"
                step={900}
                value={timeFrom}
                onChange={(event) => onCustomTimeChange(event.target.value, timeTo)}
                className="h-9 rounded-full bg-bg-input/90"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-sec">{UI_TEXT.catalog.timeSearch.to}</label>
              <Input
                type="time"
                step={900}
                value={timeTo}
                onChange={(event) => onCustomTimeChange(timeFrom, event.target.value)}
                className="h-9 rounded-full bg-bg-input/90"
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
