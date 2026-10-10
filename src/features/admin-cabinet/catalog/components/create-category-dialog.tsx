"use client";

import { useId, useState } from "react";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChipButton } from "@/components/ui/chip-button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { FieldLabel } from "@/components/ui/field-label";
import {
  CATEGORY_ICON_MAX_LENGTH,
  CATEGORY_ICON_PRESETS,
  categoryLabel,
  isCategoryIcon,
  normalizeCategoryIcon,
} from "@/lib/catalog/category-icon";
import { serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import type {
  AdminCategoryParentOption,
  AdminCategoryRow,
} from "@/features/admin-cabinet/catalog/types";

const T = UI_TEXT.adminPanel.catalog.createDialog;

export type CreateDialogValue = {
  name: string;
  /** `null` — без смайлика. */
  icon: string | null;
  parentId: string | null;
};

type Props = {
  /** When set, dialog renders in "edit" mode with pre-filled values. */
  editing: AdminCategoryRow | null;
  parentOptions: AdminCategoryParentOption[];
  onClose: () => void;
  /** Бросает ошибку запроса — окно покажет её у кнопок, а не тостом: фокус
   * заперт в окне, крестик тоста с клавиатуры недоступен. */
  onSubmit: (value: CreateDialogValue) => Promise<void>;
};

/** Shared create / edit dialog. The submit handler is supplied by the
 * caller so the same dialog drives both the POST (create) and PATCH
 * (edit) flows without leaking API URLs into a presentational layer.
 *
 * Монтируется на каждое открытие (`key` у вызывающего), поэтому начальные
 * значения берутся ленивым `useState`, без синхронизации эффектом. */
export function CreateCategoryDialog({ editing, parentOptions, onClose, onSubmit }: Props) {
  const nameId = useId();
  const nameErrorId = useId();
  const iconId = useId();
  const iconNoteId = useId();
  const parentId = useId();

  const [name, setName] = useState(() => editing?.name ?? "");
  const [icon, setIcon] = useState(() => editing?.icon ?? "");
  const [parent, setParent] = useState(() => editing?.parent?.id ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [iconError, setIconError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedIcon = normalizeCategoryIcon(icon);
  const previewIcon = selectedIcon && isCategoryIcon(selectedIcon) ? selectedIcon : null;

  const chooseIcon = (next: string) => {
    setIcon(next);
    setIconError(null);
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(T.errorNameRequired);
      return;
    }
    if (selectedIcon && !isCategoryIcon(selectedIcon)) {
      setIconError(T.iconInvalid);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit({ name: trimmed, icon: selectedIcon, parentId: parent || null });
    } catch (error) {
      // «Категория не может быть вложена сама в себя.», «Родительская категория
      // не найдена.» — отказы сервера дословно (FIX-C8).
      setSubmitError(serverMessageOr(error, T.errorGeneric));
    } finally {
      setSubmitting(false);
    }
  };

  // Filter out the category being edited from its own parent dropdown —
  // server cycle-detection also catches deeper cycles, but blocking the
  // obvious "self as parent" case at UI level avoids a needless API call.
  const filteredParents = editing
    ? parentOptions.filter((p) => p.id !== editing.id)
    : parentOptions;

  return (
    <ModalSurface open onClose={onClose} title={editing ? T.titleEdit : T.titleNew}>
      <form
        noValidate
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div>
          <FieldLabel htmlFor={nameId} tone="muted">
            {T.nameLabel}
          </FieldLabel>
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-border-subtle bg-bg-input text-xl"
            >
              {previewIcon ?? <Smile className="h-5 w-5 text-text-sec/50" strokeWidth={1.5} />}
            </span>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder={T.namePlaceholder}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? nameErrorId : undefined}
              autoFocus
            />
          </div>
          {nameError ? (
            <p id={nameErrorId} role="alert" className="mt-1.5 text-xs text-danger-text">
              {nameError}
            </p>
          ) : null}
        </div>

        <fieldset>
          <legend className="mb-2 block text-xs font-medium text-text-sec">{T.iconLabel}</legend>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_ICON_PRESETS.map((preset) => (
              <ChipButton
                key={preset}
                active={selectedIcon === preset}
                onClick={() => chooseIcon(preset)}
                className="h-9 w-9 justify-center px-0 text-lg"
              >
                {preset}
              </ChipButton>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label htmlFor={iconId} className="text-xs text-text-sec">
              {T.iconCustomLabel}
            </label>
            <Input
              id={iconId}
              value={icon}
              onChange={(event) => chooseIcon(event.target.value)}
              maxLength={CATEGORY_ICON_MAX_LENGTH}
              placeholder={T.iconPlaceholder}
              autoComplete="off"
              aria-invalid={iconError ? true : undefined}
              aria-describedby={iconNoteId}
              className="h-10 w-24 px-3 text-center text-lg"
            />
            {selectedIcon ? (
              <Button variant="ghost" size="sm" onClick={() => chooseIcon("")}>
                {T.iconClear}
              </Button>
            ) : null}
          </div>
          <p
            id={iconNoteId}
            role={iconError ? "alert" : undefined}
            className={iconError ? "mt-1.5 text-xs text-danger-text" : "mt-1.5 text-xs text-text-sec"}
          >
            {iconError ?? T.iconHint}
          </p>
        </fieldset>

        <div>
          <FieldLabel htmlFor={parentId} tone="muted">
            {T.parentLabel}
          </FieldLabel>
          <Select id={parentId} value={parent} onChange={(event) => setParent(event.target.value)}>
            <option value="">{T.parentPlaceholder}</option>
            {filteredParents.map((p) => (
              <option key={p.id} value={p.id}>
                {categoryLabel(p)}
              </option>
            ))}
          </Select>
        </div>

        {submitError ? <Notice tone="danger">{submitError}</Notice> : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {T.cancel}
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {editing ? T.saveEdit : T.saveCreate}
          </Button>
        </div>
      </form>
    </ModalSurface>
  );
}
