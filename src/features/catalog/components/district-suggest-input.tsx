"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

type Suggestion = {
  value: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

const DEBOUNCE_MS = 300;

export function DistrictSuggestInput({ value, onChange, className }: Props) {
  const [draft, setDraft] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sync external value → draft when changed externally (e.g. reset)
  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDocumentClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      const target = event.target;
      if (target instanceof Node && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [open]);

  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    const trimmed = draft.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    debounceRef.current = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);

      (async () => {
        try {
          const params = new URLSearchParams({ q: trimmed });
          const res = await fetch(`/api/address/suggest?${params.toString()}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          if (!res.ok || controller.signal.aborted) return;
          const json = (await res.json().catch(() => null)) as {
            ok: boolean;
            data: { suggestions: Array<{ value: string }> };
          } | null;
          if (!json || !json.ok || controller.signal.aborted) return;
          setSuggestions(json.data.suggestions ?? []);
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setSuggestions([]);
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [draft]);

  function selectSuggestion(val: string) {
    setDraft(val);
    onChange(val);
    setOpen(false);
    setSuggestions([]);
  }

  function clear() {
    setDraft("");
    onChange("");
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <div className="relative">
        <Input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={UI_TEXT.catalog.sidebar.districtPlaceholder}
          className="h-10 rounded-xl bg-bg-input/90 pr-8"
          aria-label={UI_TEXT.catalog.sidebar.district}
          autoComplete="off"
        />
        {draft.length > 0 ? (
          <button
            type="button"
            onClick={clear}
            aria-label={UI_TEXT.catalog.sidebar.districtClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {open && (loading || suggestions.length > 0) ? (
        <div className="absolute left-0 right-0 z-40 mt-1 max-h-52 overflow-y-auto rounded-2xl border border-border-subtle bg-bg-card shadow-card">
          {loading ? (
            <div className="px-3 py-2 text-xs text-text-sec">{UI_TEXT.common.loading}</div>
          ) : (
            suggestions.map((s, index) => (
              <Button
                key={index}
                variant="ghost"
                size="none"
                onClick={() => selectSuggestion(s.value)}
                className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium"
              >
                {s.value}
              </Button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
