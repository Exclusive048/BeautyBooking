"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  ModalSurface,
  type ModalSurfaceHeader,
  type ModalSurfaceSize,
} from "@/components/ui/modal-surface";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  header?: ModalSurfaceHeader;
  size?: ModalSurfaceSize;
  children: ReactNode;
  /**
   * Submit handler. Can be async — submitting state + the
   * "saving" label are managed internally. Throw inside to surface
   * an error via the dialog's built-in error banner; the dialog
   * stays open so the user can correct + retry.
   */
  onSubmit: () => void | Promise<void>;
  submitLabel?: string;
  cancelLabel?: string;
  /**
   * Submit button visual. FORMDIALOG-V2-A added `"secondary"` to
   * unlock dialogs whose UX intentionally de-emphasises the
   * primary action (e.g. `pause-master-dialog` — pausing a master
   * is non-destructive but also non-positive, so the button is
   * presented in the secondary tone). Default `"primary"` keeps
   * the original V1 behaviour for all 12 existing callers.
   */
  submitVariant?: "primary" | "danger" | "secondary";
  /**
   * Disable the submit button externally (e.g. while form is
   * incomplete or validating). The dialog also disables it during
   * its own submitting state.
   */
  submitDisabled?: boolean;
  /**
   * Externally-managed error to display above the footer. Useful
   * when the caller wants to render a server-side error code with
   * custom UI. If `onSubmit` throws, its message is shown instead.
   */
  error?: string | null;
  className?: string;
};

/**
 * Form-dialog convenience wrapper around `ModalSurface`. Replaces
 * the repeated `mt-5 flex justify-end gap-2 + submitting state +
 * error display` boilerplate found in ~60 form modals across the
 * cabinets.
 *
 * Use for the common shape: title + body (form fields) + Cancel +
 * Submit. The submit button shows a saving label and is disabled
 * while `onSubmit` is in flight. If `onSubmit` throws, its message
 * is captured as an inline error.
 *
 * For richer needs (custom footer, no Submit, multi-button) drop
 * down to `ModalSurface` directly — this wrapper is for the easy
 * case.
 */
export function FormDialog({
  open,
  onClose,
  title,
  header,
  size = "lg",
  children,
  onSubmit,
  submitLabel,
  cancelLabel,
  submitVariant = "primary",
  submitDisabled = false,
  error,
  className,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);

  const resolvedSubmit = submitLabel ?? UI_TEXT.common.save;
  const resolvedCancel = cancelLabel ?? UI_TEXT.common.cancel;
  const displayError = error ?? internalError;

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    if (event) {
      event.preventDefault();
    }
    if (submitting || submitDisabled) return;
    setSubmitting(true);
    setInternalError(null);
    try {
      await onSubmit();
    } catch (caught) {
      setInternalError(
        caught instanceof Error ? caught.message : UI_TEXT.common.errorGeneric,
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    if (submitting) return;
    setInternalError(null);
    onClose();
  }

  return (
    <ModalSurface
      open={open}
      onClose={handleCancel}
      title={title}
      header={header}
      size={size}
      className={className}
    >
      <form
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        <div className="space-y-3">{children}</div>

        {displayError ? (
          <div
            role="alert"
            className="rounded-xl border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-text"
          >
            {displayError}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleCancel}
            disabled={submitting}
          >
            {resolvedCancel}
          </Button>
          <Button
            type="submit"
            variant={submitVariant ?? "primary"}
            size="sm"
            disabled={submitting || submitDisabled}
          >
            {submitting ? UI_TEXT.common.saving : resolvedSubmit}
          </Button>
        </div>
      </form>
    </ModalSurface>
  );
}
