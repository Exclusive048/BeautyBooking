"use client";

import { X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { PortfolioTagOption } from "@/lib/master/portfolio-view.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.portfolioPage.edit;

type Props = {
  /** Currently-selected tag ids on the item. */
  value: string[];
  /** All tags the master has used previously. Tag ids referenced by
   * `value` are expected to live here. */
  options: PortfolioTagOption[];
  onChange: (next: string[]) => void;
};

/**
 * Tag editor with autocomplete from the master's existing tag pool.
 *
 * **31b scope** — only existing tags can be selected. New-tag creation
 * is on the backlog (slug generation, dedup, moderation flow). Empty
 * pool is fine — the master can simply skip the field.
 */
export function TagInput({ value, options, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const optionById = useMemo(() => {
    const map = new Map<string, PortfolioTagOption>();
    for (const option of options) map.set(option.id, option);
    return map;
  }, [options]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options
      .filter((option) => !value.includes(option.id))
      .filter((option) => (q ? option.name.toLowerCase().includes(q) : true))
      .slice(0, 10);
  }, [options, query, value]);

  const add = (id: string) => {
    if (value.includes(id)) return;
    onChange([...value, id]);
    setQuery("");
    setOpen(false);
    queueMicrotask(() => inputRef.current?.focus());
  };

  const remove = (id: string) => {
    onChange(value.filter((existing) => existing !== id));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && query === "" && value.length > 0) {
      event.preventDefault();
      onChange(value.slice(0, -1));
    } else if (event.key === "Enter" && matches.length > 0) {
      event.preventDefault();
      add(matches[0]!.id);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 rounded-xl border border-border-subtle bg-bg-input px-2 py-1.5",
          "focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/40"
        )}
      >
        {value.map((id) => {
          const option = optionById.get(id);
          if (!option) return null;
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
            >
              <span>{option.name}</span>
              <button
                type="button"
                onClick={() => remove(id)}
                aria-label="remove"
                className="text-primary/60 hover:text-primary"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? T.tagsPlaceholder : ""}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-text-main outline-none"
        />
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-border-subtle bg-bg-card py-1 shadow-card">
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-xs italic text-text-sec">{T.tagsNoResults}</p>
          ) : (
            <ul className="max-h-48 overflow-auto">
              {matches.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => add(option.id)}
                    className="block w-full px-3 py-2 text-left text-sm text-text-main hover:bg-bg-input"
                  >
                    {option.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <p className="mt-1.5 text-xs text-text-sec">{T.tagsHelp}</p>
    </div>
  );
}
