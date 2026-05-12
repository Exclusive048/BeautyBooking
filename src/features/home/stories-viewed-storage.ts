import type { StoriesGroup } from "@/features/home/types/stories";

const KEY = "mr-stories-viewed-items";
const LEGACY_KEY = "mr-stories-viewed"; // 04-STORIES used masterId-level tracking
const MAX_STORED = 1000;

let legacyCleared = false;

function clearLegacy(): void {
  if (legacyCleared) return;
  legacyCleared = true;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // ignore
  }
}

export function getViewedItemIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  clearLegacy();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? new Set(arr.filter((x): x is string => typeof x === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

export function markItemViewed(itemId: string): void {
  if (typeof window === "undefined") return;
  const set = getViewedItemIds();
  if (set.has(itemId)) return;
  set.add(itemId);
  const arr = Array.from(set).slice(-MAX_STORED);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {
    // localStorage may be full or disabled — no-op
  }
}

export function isMasterFullyViewed(group: StoriesGroup, viewed: Set<string>): boolean {
  if (group.items.length === 0) return false;
  return group.items.every((item) => viewed.has(item.id));
}
