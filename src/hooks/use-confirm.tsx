"use client";

import { useCallback, useState } from "react";
import { ConfirmModal, type ConfirmOptions } from "@/components/ui/confirm-modal";

type State = (ConfirmOptions & { resolve: (value: boolean) => void }) | null;

/**
 * Imperative confirm-dialog hook. Returns `{ confirm, modal }`:
 *
 *   const { confirm, modal } = useConfirm();
 *   const ok = await confirm({ message: "Удалить?", variant: "danger" });
 *   if (ok) doDelete();
 *   return <>{...}{modal}</>;
 *
 * Replaces native `window.confirm()` so we stay inside the design
 * system (centered card, branded buttons, async-friendly). The modal
 * node must be rendered somewhere in the component's tree — usually
 * at the end of the returned JSX.
 *
 * The handlers close over `state` directly (re-created when state
 * changes) instead of relying on a ref — React 19's lint rule forbids
 * writing to refs during render, and stale closures would mean clicks
 * after a re-render call `resolve` against the wrong promise.
 */
export function useConfirm() {
  const [state, setState] = useState<State>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (!state) return;
    state.resolve(true);
    setState(null);
  }, [state]);

  const handleCancel = useCallback(() => {
    if (!state) return;
    state.resolve(false);
    setState(null);
  }, [state]);

  const modal = state ? (
    <ConfirmModal
      open
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      variant={state.variant}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return { confirm, modal } as const;
}
