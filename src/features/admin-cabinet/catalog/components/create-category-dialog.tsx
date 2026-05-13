"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { UI_TEXT } from "@/lib/ui/text";
import type {
  AdminCategoryParentOption,
  AdminCategoryRow,
} from "@/features/admin-cabinet/catalog/types";

const T = UI_TEXT.adminPanel.catalog.createDialog;

export type CreateDialogValue = {
  name: string;
  parentId: string | null;
};

type Props = {
  open: boolean;
  /** When set, dialog renders in "edit" mode with pre-filled values. */
  editing: AdminCategoryRow | null;
  parentOptions: AdminCategoryParentOption[];
  onClose: () => void;
  onSubmit: (value: CreateDialogValue) => Promise<void>;
};

/** Shared create / edit dialog. The submit handler is supplied by the
 * caller so the same dialog drives both the POST (create) and PATCH
 * (edit) flows without leaking API URLs into a presentational layer. */
export function CreateCategoryDialog({
  open,
  editing,
  parentOptions,
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill when entering edit mode; reset when opening fresh.
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setParentId(editing?.parent?.id ?? "");
    setError(null);
  }, [open, editing]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(T.errorNameRequired);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        name: trimmed,
        parentId: parentId || null,
      });
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
    <ModalSurface
      open={open}
      onClose={onClose}
      title={editing ? T.titleEdit : T.titleNew}
    >
      <div className="space-y-4">
        <div>
          <label
            htmlFor="category-name"
            className="mb-1.5 block text-xs font-medium text-text-sec"
          >
            {T.nameLabel}
          </label>
          <Input
            id="category-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError(null);
            }}
            placeholder={T.namePlaceholder}
            autoFocus
          />
          {error ? (
            <p
              role="alert"
              className="mt-1.5 text-xs text-red-600 dark:text-red-400"
            >
              {error}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="category-parent"
            className="mb-1.5 block text-xs font-medium text-text-sec"
          >
            {T.parentLabel}
          </label>
          <Select
            id="category-parent"
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">{T.parentPlaceholder}</option>
            {filteredParents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {T.cancel}
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={submitting}>
            {editing ? T.saveEdit : T.saveCreate}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
