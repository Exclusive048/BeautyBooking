"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

const SLOT_ROW_HEIGHT = 44;
const SLOT_LIST_MAX_HEIGHT = 320;
const VIRTUALIZE_THRESHOLD = 24;
const OVERSCAN_ROWS = 6;

export type SlotItem = {
  id: string;
  label: string;
  timeText: string;
  disabled?: boolean;
  isHot?: boolean;
  discountType?: "PERCENT" | "FIXED";
  discountValue?: number;
};

export type SlotGroup = {
  id: "morning" | "day" | "evening";
  label: string;
  items: SlotItem[];
  defaultOpen: boolean;
};

export function groupSlotsByTimeOfDay(slots: SlotItem[]): SlotGroup[] {
  const morning: SlotItem[] = [];
  const day: SlotItem[] = [];
  const evening: SlotItem[] = [];

  for (const slot of slots) {
    const hour = Number.parseInt(slot.timeText.slice(0, 2), 10);
    const safeHour = Number.isFinite(hour) ? hour : 0;
    if (safeHour < 12) {
      morning.push(slot);
    } else if (safeHour < 18) {
      day.push(slot);
    } else {
      evening.push(slot);
    }
  }

  const defaultOpenId =
    morning.length > 0 ? "morning" : day.length > 0 ? "day" : evening.length > 0 ? "evening" : null;

  return [
    {
      id: "morning",
      label: UI_TEXT.clientCabinet.booking.morning,
      items: morning,
      defaultOpen: defaultOpenId === "morning",
    },
    {
      id: "day",
      label: UI_TEXT.clientCabinet.booking.day,
      items: day,
      defaultOpen: defaultOpenId === "day",
    },
    {
      id: "evening",
      label: UI_TEXT.clientCabinet.booking.evening,
      items: evening,
      defaultOpen: defaultOpenId === "evening",
    },
  ];
}

type SlotPickerProps = {
  groups: SlotGroup[];
  value?: string;
  onChange?: (label: string) => void;
  disabled?: boolean;
};

export const SlotPickerOptimized = memo(function SlotPickerOptimized({
  groups,
  value,
  onChange,
  disabled,
}: SlotPickerProps) {
  const renderCount = useRef(0);
  const isDev = process.env.NODE_ENV !== "production";

  useEffect(() => {
    if (!isDev) return;
    renderCount.current += 1;
    console.debug(`[render] SlotPickerOptimized #${renderCount.current}`);
  }, [isDev]);

  const defaultOpen = useMemo(() => {
    const next: Record<string, boolean> = {};
    for (const group of groups) {
      if (group.defaultOpen) {
        next[group.id] = true;
      }
    }
    return next;
  }, [groups]);

  const [openById, setOpenById] = useState<Record<string, boolean>>(defaultOpen);

  useEffect(() => {
    setOpenById(defaultOpen);
  }, [defaultOpen]);

  const handleToggle = useCallback((id: string) => {
    setOpenById((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleChange = useCallback(
    (label: string) => {
      onChange?.(label);
    },
    [onChange]
  );

  return (
    <div className={cn("space-y-4", disabled && "pointer-events-none opacity-50")}>
      {groups.map((group) => (
        <SlotGroupRow
          key={group.id}
          group={group}
          isOpen={openById[group.id] ?? false}
          activeLabel={value}
          disabled={disabled}
          onToggle={handleToggle}
          onChange={handleChange}
        />
      ))}
    </div>
  );
});

type SlotGroupRowProps = {
  group: SlotGroup;
  isOpen: boolean;
  activeLabel?: string;
  disabled?: boolean;
  onToggle: (id: string) => void;
  onChange: (label: string) => void;
};

const SlotGroupRow = memo(function SlotGroupRow({
  group,
  isOpen,
  activeLabel,
  disabled,
  onToggle,
  onChange,
}: SlotGroupRowProps) {
  const hasItems = group.items.length > 0;
  const shouldVirtualize = group.items.length >= VIRTUALIZE_THRESHOLD;
  const content =
    isOpen && hasItems
      ? shouldVirtualize
        ? (
            <VirtualizedSlotList
              items={group.items}
              activeLabel={activeLabel}
              disabled={disabled}
              onChange={onChange}
            />
          )
        : (
            <div className="flex flex-wrap gap-2">
              {group.items.map((slot) => (
                <SlotButton
                  key={slot.id}
                  label={slot.label}
                  timeText={slot.timeText}
                  active={activeLabel === slot.label}
                  disabled={disabled || slot.disabled}
                  isHot={slot.isHot}
                  discountType={slot.discountType}
                  discountValue={slot.discountValue}
                  onChange={onChange}
                />
              ))}
            </div>
          )
      : null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => onToggle(group.id)}
        className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left"
        aria-expanded={isOpen}
      >
        <span className="text-xs font-semibold text-neutral-600">{group.label}</span>
        <span className="text-xs text-neutral-400">{group.items.length}</span>
      </button>
      {content}
    </div>
  );
});

type SlotButtonProps = {
  label: string;
  timeText: string;
  active: boolean;
  disabled?: boolean;
  onChange: (label: string) => void;
  className?: string;
  isHot?: boolean;
  discountType?: "PERCENT" | "FIXED";
  discountValue?: number;
};

const SlotButton = memo(function SlotButton({
  label,
  timeText,
  active,
  disabled,
  onChange,
  className,
  isHot,
  discountType,
  discountValue,
}: SlotButtonProps) {
  const handleClick = useCallback(() => onChange(label), [label, onChange]);
  const hotLabel =
    isHot && typeof discountValue === "number"
      ? discountType === "FIXED"
        ? `HOT -${discountValue} RUB`
        : `HOT -${discountValue}%`
      : null;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "rounded-2xl border px-3 py-2 text-sm transition",
        active
          ? "border-neutral-900 bg-neutral-900 text-white"
          : isHot
            ? "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
            : "border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50",
        disabled && "cursor-not-allowed opacity-60",
        className
      )}
    >
      <span className="inline-flex items-center gap-2">
        {timeText}
        {hotLabel ? (
          <span className="rounded-full bg-amber-200/60 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
            {hotLabel}
          </span>
        ) : null}
      </span>
    </button>
  );
});

type VirtualizedSlotListProps = {
  items: SlotItem[];
  activeLabel?: string;
  disabled?: boolean;
  onChange: (label: string) => void;
};

const VirtualizedSlotList = memo(function VirtualizedSlotList({
  items,
  activeLabel,
  disabled,
  onChange,
}: VirtualizedSlotListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => SLOT_ROW_HEIGHT,
    overscan: OVERSCAN_ROWS,
  });

  return (
    <div ref={parentRef} className="relative overflow-auto" style={{ maxHeight: SLOT_LIST_MAX_HEIGHT }}>
      <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const slot = items[virtualRow.index];
          return (
            <div
              key={slot.id}
              className="absolute left-0 top-0 w-full px-1"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <SlotButton
                label={slot.label}
                timeText={slot.timeText}
                active={activeLabel === slot.label}
                disabled={disabled || slot.disabled}
                onChange={onChange}
                isHot={slot.isHot}
                discountType={slot.discountType}
                discountValue={slot.discountValue}
                className="flex w-full items-center justify-between text-left"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

