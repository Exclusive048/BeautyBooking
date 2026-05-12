"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { StoriesGroup } from "@/features/home/types/stories";

export type ViewerState = {
  groups: StoriesGroup[];
  activeMasterIdx: number;
  activeItemIdx: number;
  /** Direction of last navigation between masters: -1 = back, 1 = forward, 0 = none. */
  direction: -1 | 0 | 1;
};

type ViewerContextValue = {
  state: ViewerState | null;
  open: (groups: StoriesGroup[], masterIdx: number) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
  goToMaster: (idx: number) => void;
  /** Increments whenever an item id is marked viewed; consumers can recompute derived state. */
  viewedRevision: number;
  bumpViewedRevision: () => void;
};

const StoriesViewerContext = createContext<ViewerContextValue | null>(null);

export function StoriesViewerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ViewerState | null>(null);
  const [viewedRevision, setViewedRevision] = useState(0);

  const open = useCallback((groups: StoriesGroup[], masterIdx: number) => {
    if (groups.length === 0) return;
    const safeIdx = Math.max(0, Math.min(masterIdx, groups.length - 1));
    setState({
      groups,
      activeMasterIdx: safeIdx,
      activeItemIdx: 0,
      direction: 0,
    });
  }, []);

  const close = useCallback(() => {
    setState(null);
  }, []);

  const next = useCallback(() => {
    setState((current) => {
      if (!current) return current;
      const group = current.groups[current.activeMasterIdx];
      if (!group) return null;
      // Next photo within same master?
      if (current.activeItemIdx < group.items.length - 1) {
        return { ...current, activeItemIdx: current.activeItemIdx + 1, direction: 0 };
      }
      // Move to next master?
      if (current.activeMasterIdx < current.groups.length - 1) {
        return {
          ...current,
          activeMasterIdx: current.activeMasterIdx + 1,
          activeItemIdx: 0,
          direction: 1,
        };
      }
      // End of all stories.
      return null;
    });
  }, []);

  const prev = useCallback(() => {
    setState((current) => {
      if (!current) return current;
      // Previous photo within same master?
      if (current.activeItemIdx > 0) {
        return { ...current, activeItemIdx: current.activeItemIdx - 1, direction: 0 };
      }
      // Move to previous master (last item)?
      if (current.activeMasterIdx > 0) {
        const prevIdx = current.activeMasterIdx - 1;
        const prevGroup = current.groups[prevIdx];
        const lastItem = prevGroup ? Math.max(0, prevGroup.items.length - 1) : 0;
        return {
          ...current,
          activeMasterIdx: prevIdx,
          activeItemIdx: lastItem,
          direction: -1,
        };
      }
      // First item of first master — stay put.
      return current;
    });
  }, []);

  const goToMaster = useCallback((idx: number) => {
    setState((current) => {
      if (!current) return current;
      const safeIdx = Math.max(0, Math.min(idx, current.groups.length - 1));
      const direction =
        safeIdx > current.activeMasterIdx ? 1 : safeIdx < current.activeMasterIdx ? -1 : 0;
      return { ...current, activeMasterIdx: safeIdx, activeItemIdx: 0, direction };
    });
  }, []);

  const bumpViewedRevision = useCallback(() => {
    setViewedRevision((n) => n + 1);
  }, []);

  const value = useMemo<ViewerContextValue>(
    () => ({ state, open, close, next, prev, goToMaster, viewedRevision, bumpViewedRevision }),
    [state, open, close, next, prev, goToMaster, viewedRevision, bumpViewedRevision],
  );

  return (
    <StoriesViewerContext.Provider value={value}>{children}</StoriesViewerContext.Provider>
  );
}

export function useStoriesViewer(): ViewerContextValue {
  const ctx = useContext(StoriesViewerContext);
  if (!ctx) {
    throw new Error("useStoriesViewer must be used inside <StoriesViewerProvider>");
  }
  return ctx;
}
