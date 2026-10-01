"use client";

import { useId, useRef, useState } from "react";
import { SocialLinkPreview } from "@/components/ui/social-link-preview";
import {
  normalizeSocialLink,
  socialDisplayLabel,
  type SocialKind,
} from "@/lib/providers/social-links";
import { fetchJsonWithAuth, serverMessageOf } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { SaveStatusChip } from "./save-status-chip";
import { useAutosave } from "./use-autosave";
import { InlineEditField, InlineEditInput, InlineEditPencil } from "@/components/ui/inline-edit";

const T = UI_TEXT.social;

/**
 * FEAT-PROVIDER-SOCIALS — master-cabinet inline-edit row for a VK / Instagram
 * community link. Mirrors `EditableFieldRow`'s autosave lifecycle but:
 *  - shows a live preview (`<SocialLinkPreview>`) using the shared normalizer;
 *  - never saves an invalid link (the preview flags it, save is blocked);
 *  - stores the CLIENT-normalized URL (server re-validates — idempotent), so
 *    the view-mode label reflects exactly what will render publicly without an
 *    SSR refetch.
 */
export function SocialEditableRow({
  kind,
  label,
  placeholder,
  value,
}: {
  kind: SocialKind;
  label: string;
  placeholder: string;
  value: string | null;
}) {
  const inputId = useId();
  const fieldKey = kind === "vk" ? "socialVk" : "socialInstagram";
  const [isEditing, setIsEditing] = useState(false);
  const [savedValue, setSavedValue] = useState(value ?? "");
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const autosave = useAutosave<string>(async (next) => {
    try {
      await fetchJsonWithAuth<unknown>("/api/master/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [fieldKey]: next || null }),
      });
    } catch (error) {
      // «Ссылка должна вести на …» (INVALID_SOCIAL_LINK) — дословно.
      return { ok: false, message: serverMessageOf(error) };
    }
    return { ok: true };
  });

  const enterEdit = () => {
    if (isEditing) return;
    autosave.setBaseline(savedValue);
    setDraft(savedValue);
    setIsEditing(true);
    queueMicrotask(() => inputRef.current?.focus());
  };

  const handleChange = (next: string) => {
    setDraft(next);
    const result = normalizeSocialLink(kind, next);
    if (result.status === "invalid") {
      autosave.cancel();
      return;
    }
    autosave.scheduleSave(result.status === "ok" ? result.url : "");
  };

  const commitAndExit = () => {
    const result = normalizeSocialLink(kind, draft);
    if (result.status === "invalid") return false;
    const nextStored = result.status === "ok" ? result.url : "";
    setSavedValue(nextStored);
    void autosave.flush(nextStored);
    setIsEditing(false);
    return true;
  };

  const handleBlur = () => {
    const result = normalizeSocialLink(kind, draft);
    if (result.status === "invalid") {
      // Don't persist a bad link — revert to the last saved value.
      setDraft(savedValue);
      autosave.cancel();
      setIsEditing(false);
      return;
    }
    const nextStored = result.status === "ok" ? result.url : "";
    setSavedValue(nextStored);
    void autosave.flush(nextStored);
    setIsEditing(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitAndExit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDraft(savedValue);
      autosave.cancel();
      setIsEditing(false);
    }
  };

  const displayLabel = socialDisplayLabel(kind, savedValue);
  const isEmpty = !displayLabel;

  return (
    <div className="group flex items-start gap-3 border-b border-border-subtle py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <label
            htmlFor={inputId}
            className="font-mono text-3xs uppercase tracking-[0.18em] text-text-sec"
          >
            {label}
          </label>
          <SaveStatusChip status={autosave.status} />
        </div>
        {isEditing ? (
          <>
            <InlineEditInput
              id={inputId}
              ref={inputRef}
              value={draft}
              onChange={(event) => handleChange(event.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              maxLength={200}
              placeholder={placeholder}
              className="mt-1"
            />
            <SocialLinkPreview kind={kind} value={draft} />
          </>
        ) : (
          <InlineEditField
            onClick={enterEdit}
            empty={isEmpty}
            className="mt-1"
          >
            {isEmpty ? T.notSet : displayLabel}
          </InlineEditField>
        )}
        {autosave.errorMessage ? (
          <p role="alert" className="mt-1 text-xs text-danger-text">
            {autosave.errorMessage}
          </p>
        ) : null}
      </div>
      {!isEditing ? (
        <InlineEditPencil
          onClick={enterEdit}
          aria-label={T.editAria}
          className="mt-2"
        />
      ) : null}
    </div>
  );
}
