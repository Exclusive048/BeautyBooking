"use client";

import { useCallback, useState } from "react";
import { PromptModal, type PromptOptions } from "@/components/ui/prompt-modal";

type State = (PromptOptions & { resolve: (value: string | null) => void }) | null;

/**
 * MASTER-BOOKING-UI-FIX-A — imperative text-prompt hook. Mirrors the
 * `useConfirm()` shape but resolves with the trimmed string (or `null`
 * on cancel) instead of a boolean:
 *
 *   const { prompt, modal } = usePrompt();
 *   const reason = await prompt({
 *     title: "Отклонить запись",
 *     label: "Причина",
 *     placeholder: "Например: «Конфликт по времени»",
 *     variant: "danger",
 *   });
 *   if (reason) await api.reject(reason);
 *   return <>{...}{modal}</>;
 *
 * Replaces `window.prompt()` so booking actions stay inside the design
 * system. The promise resolves with `null` if the user clicks Cancel
 * or closes the modal — distinguishable from an empty submit (which
 * the modal won't accept when `required: true`, the default).
 *
 * Handlers re-create on every state change to avoid stale closures
 * resolving the wrong promise (same pattern as `useConfirm`).
 */
export function usePrompt() {
  const [state, setState] = useState<State>(null);

  const prompt = useCallback((options: PromptOptions): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const handleConfirm = useCallback(
    async (value: string) => {
      if (!state) return;
      state.resolve(value);
      setState(null);
    },
    [state],
  );

  const handleCancel = useCallback(() => {
    if (!state) return;
    state.resolve(null);
    setState(null);
  }, [state]);

  const modal = state ? (
    <PromptModal
      open
      title={state.title}
      message={state.message}
      label={state.label}
      placeholder={state.placeholder}
      required={state.required}
      maxLength={state.maxLength}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      variant={state.variant}
      onConfirm={(value) => void handleConfirm(value)}
      onCancel={handleCancel}
    />
  ) : null;

  return { prompt, modal } as const;
}
