"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type Ctx = {
  status: SaveStatus;
  setStatus: (next: SaveStatus) => void;
  errorMessage: string | null;
  setErrorMessage: (next: string | null) => void;
};

const Context = createContext<Ctx | null>(null);

/**
 * Shares the auto-save lifecycle (idle → saving → saved → error) between
 * the page-header chip and the form content. The provider is rendered by
 * the server orchestrator so both branches of the React tree (header
 * actions and body) read the same state.
 */
export function SaveStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatusState] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const setStatus = useCallback((next: SaveStatus) => {
    setStatusState(next);
    if (next !== "error") setErrorMessage(null);
  }, []);

  return (
    <Context.Provider value={{ status, setStatus, errorMessage, setErrorMessage }}>
      {children}
    </Context.Provider>
  );
}

export function useSaveStatus(): Ctx {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useSaveStatus must be used inside <SaveStatusProvider>");
  }
  return ctx;
}
