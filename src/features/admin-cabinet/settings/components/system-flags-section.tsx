"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FlagRow } from "@/features/admin-cabinet/settings/components/flag-row";
import { SectionCard } from "@/features/admin-cabinet/settings/components/section-card";
import { REAL_FLAGS } from "@/features/admin-cabinet/settings/lib/flag-registry";
import type { SystemFlags } from "@/features/admin-cabinet/settings/types";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  initial: SystemFlags;
};

export function SystemFlagsSection({ initial }: Props) {
  const t = UI_TEXT.adminPanel.settings.sections.flags;

  const [baseline, setBaseline] = useState<SystemFlags>(initial);
  const [draft, setDraft] = useState<SystemFlags>(initial);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const dirty = useMemo(
    () => REAL_FLAGS.some((flag) => draft[flag.key] !== baseline[flag.key]),
    [draft, baseline],
  );

  const handleChange = (key: keyof SystemFlags, value: boolean) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (status === "saved" || status === "error") setStatus("idle");
  };

  const handleSave = async () => {
    if (!dirty || status === "saving") return;
    setStatus("saving");
    setErrorMessage(null);

    const payload: Partial<SystemFlags> = {};
    for (const flag of REAL_FLAGS) {
      if (draft[flag.key] !== baseline[flag.key]) {
        payload[flag.key] = draft[flag.key];
      }
    }

    try {
      const res = await fetch("/api/admin/system-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<SystemFlags> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.errorLabel);
      }
      setBaseline(json.data);
      setDraft(json.data);
      setStatus("saved");
      window.setTimeout(() => setStatus((curr) => (curr === "saved" ? "idle" : curr)), 1800);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : t.errorLabel);
    }
  };

  return (
    <SectionCard
      title={t.title}
      description={t.desc}
      footer={
        <>
          <AnimatePresence mode="wait">
            {status === "saving" ? (
              <motion.span
                key="saving"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-xs text-text-sec"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {t.savingLabel}
              </motion.span>
            ) : status === "saved" ? (
              <motion.span
                key="saved"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                {t.savedLabel}
              </motion.span>
            ) : status === "error" ? (
              <motion.span
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400"
              >
                <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                {errorMessage ?? t.errorLabel}
              </motion.span>
            ) : dirty ? (
              <motion.span
                key="dirty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs text-text-sec"
              >
                {t.dirtyHint}
              </motion.span>
            ) : null}
          </AnimatePresence>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleSave()}
            disabled={!dirty || status === "saving"}
          >
            {t.saveButton}
          </Button>
        </>
      }
    >
      {REAL_FLAGS.map((flag) => {
        const def = t.flags[flag.labelKey];
        return (
          <FlagRow
            key={flag.key}
            label={def.label}
            description={def.desc}
            checked={draft[flag.key]}
            onChange={(value) => handleChange(flag.key, value)}
            disabled={status === "saving"}
          />
        );
      })}
    </SectionCard>
  );
}
