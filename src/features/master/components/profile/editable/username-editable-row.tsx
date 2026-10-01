"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/hooks/use-confirm";
import { cn } from "@/lib/cn";
import {
  normalizeUsernameInput,
  validateUsername,
} from "@/lib/publicUsername";
import { ApiClientError, fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { InlineEditField, InlineEditInput, InlineEditPencil } from "@/components/ui/inline-edit";

const T = UI_TEXT.cabinetMaster.profile.header;
const EDIT_T = UI_TEXT.cabinetMaster.profile.editable;

type Props = {
  value: string | null;
};

const ENDPOINT = "/api/cabinet/master/public-username";

/**
 * Editable nickname row for the master profile header.
 *
 * Unlike the autosave-on-blur `<EditableFieldRow>` used for
 * name/tagline/phone, the nickname commits through an explicit
 * Save click + a confirm dialog. The change is consequential:
 *
 *   - It rewrites the master's public URL `/u/<username>`.
 *   - Old usernames are kept in `PublicUsernameAlias` (last 10) and
 *     served as `permanentRedirect` from the public route, so links
 *     in DMs and bookmarks keep working — but only up to that cap.
 *   - The backend endpoint is POST (with its own validation +
 *     uniqueness check), not the generic PATCH `/api/me`.
 *
 * Live validation mirrors the server rules from
 * `src/lib/publicUsername.ts` so the user sees instant feedback while
 * typing; the server stays the source of truth for uniqueness.
 */
export function UsernameEditableRow({ value }: Props) {
  const router = useRouter();
  const { confirm, modal: confirmModal } = useConfirm();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const trimmed = useMemo(() => normalizeUsernameInput(draft), [draft]);
  const validation = useMemo(() => {
    if (trimmed.length === 0) {
      return { ok: false as const, reason: T.usernameHint };
    }
    return validateUsername(trimmed);
  }, [trimmed]);
  const isUnchanged = trimmed === (value ?? "");

  const isValueSet = Boolean(value && value.trim().length > 0);

  function enterEdit() {
    if (isEditing) return;
    setDraft(value ?? "");
    setServerError(null);
    setIsEditing(true);
    queueMicrotask(() => inputRef.current?.focus());
  }

  function cancelEdit() {
    setDraft(value ?? "");
    setServerError(null);
    setIsEditing(false);
  }

  async function commit() {
    if (!validation.ok || isUnchanged || submitting) return;
    const ok = await confirm({
      title: T.usernameConfirmTitle,
      message: T.usernameConfirmMessageTemplate.replace("{username}", trimmed),
      confirmLabel: T.usernameConfirmCta,
    });
    if (!ok) return;

    setSubmitting(true);
    setServerError(null);
    try {
      await fetchJsonWithAuth<unknown>(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed }),
      });
      setIsEditing(false);
      startTransition(() => router.refresh());
    } catch (error) {
      // Занятый адрес — своя, более точная строка поверхности; прочее — дословно.
      if (error instanceof ApiClientError && error.status === 409) {
        setServerError(T.usernameErrorTaken);
      } else {
        setServerError(serverMessageOr(error, T.usernameErrorGeneric));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
  }

  const showValidationError =
    !validation.ok && trimmed.length > 0 && validation.reason !== T.usernameHint;
  const hint = serverError
    ? serverError
    : showValidationError
      ? validation.reason
      : T.usernameHint;
  const hintTone = serverError || showValidationError ? "text-danger-text" : "text-text-sec";

  return (
    <div className="group flex items-start gap-3 border-b border-border-subtle py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <label
            htmlFor={inputId}
            className="font-mono text-3xs uppercase tracking-[0.18em] text-text-sec"
          >
            {T.usernameLabel}
          </label>
        </div>

        {isEditing ? (
          <div className="mt-1 space-y-2">
            {/* UI-32: подчёркивание живёт на обёртке (внутри неё префикс
                «@» и само поле), поэтому и на фокус реагирует обёртка через
                `focus-within`. Строка закрывается кнопками «Отмена»/
                «Сохранить», а не по blur, — значит поле бывает видно
                расфокусированным, и сплошной primary про фокус не говорил
                ничего. */}
            <div className="flex items-baseline gap-1 border-b-2 border-border-subtle py-1 focus-within:border-primary">
              <span className="shrink-0 text-sm text-text-sec">{T.usernamePrefix}</span>
              <InlineEditInput underline="none"
                id={inputId}
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={32}
                placeholder={T.usernamePlaceholder}
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                className="w-auto min-w-0 flex-1 py-0"
              />
            </div>
            <p className={cn("font-mono text-2xs", hintTone)}>
              {hint}
            </p>
            {!serverError && validation.ok && isUnchanged ? (
              <p className="font-mono text-2xs text-text-sec">
                {T.usernameUnchangedHint}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={cancelEdit}
                disabled={submitting}
              >
                {T.usernameCancelCta}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => void commit()}
                disabled={submitting || !validation.ok || isUnchanged}
              >
                {T.usernameSaveCta}
              </Button>
            </div>
          </div>
        ) : (
          <InlineEditField
            onClick={enterEdit}
            empty={!isValueSet}
            className="mt-1 break-all"
          >
            {isValueSet ? (
              <>
                <span className="text-text-sec">{T.usernamePrefix}</span>
                <span className="text-text-main">{value}</span>
              </>
            ) : (
              T.usernameNotSet
            )}
          </InlineEditField>
        )}
      </div>

      {!isEditing ? (
        <InlineEditPencil
          onClick={enterEdit}
          aria-label={EDIT_T.editAriaLabel}
          className="mt-2"
        />
      ) : null}

      {confirmModal}
    </div>
  );
}
