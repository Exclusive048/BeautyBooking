"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ExternalLink, Loader2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/features/admin-cabinet/settings/components/section-card";
import type { VkCommunityView } from "@/features/admin-cabinet/settings/types";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type Status = "idle" | "saving" | "removing" | "saved" | "removed" | "error";

type Props = {
  initial: VkCommunityView;
};

/**
 * VK-COMMUNITY-NOTIFY-01 — ключ доступа сообщества ВКонтакте. Решение
 * владельца: без env-переменной — ключ вводится здесь, сообщество берётся из
 * ссылки в футере (`NEXT_PUBLIC_VK_COMMUNITY_URL`). Сервер ключ проверяет у VK
 * и обратно не отдаёт, поэтому поле всегда пустое: сохранённый ключ можно
 * только заменить или удалить.
 */
export function VkCommunitySection({ initial }: Props) {
  const t = UI_TEXT.adminPanel.settings.sections.vkCommunity;
  const [view, setView] = useState<VkCommunityView>(initial);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const reduce = useReducedMotion();

  const busy = status === "saving" || status === "removing";
  const hasStored = view.community !== null;

  const request = async (method: "PUT" | "DELETE") => {
    if (busy) return;
    setStatus(method === "PUT" ? "saving" : "removing");
    setErrorMessage(null);
    const fallback = method === "PUT" ? t.errorLabel : t.removeErrorLabel;
    try {
      const res = await fetch("/api/admin/vk-community", {
        method,
        headers: method === "PUT" ? { "Content-Type": "application/json" } : undefined,
        body: method === "PUT" ? JSON.stringify({ token: token.trim() }) : undefined,
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<VkCommunityView> | null;
      if (!res.ok || !json || !json.ok) {
        // Сервер отвечает действенным текстом («ключ другого сообщества», «нет
        // права на сообщения») — его и показываем.
        throw new Error(json && !json.ok ? json.error.message : fallback);
      }
      setView(json.data);
      setToken("");
      setStatus(method === "PUT" ? "saved" : "removed");
      window.setTimeout(() => setStatus((curr) => (curr === "saved" || curr === "removed" ? "idle" : curr)), 1800);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : fallback);
    }
  };

  const badge = view.configured ? (
    <Badge variant="success">{t.statusConnected}</Badge>
  ) : hasStored ? (
    <Badge variant="danger">{t.statusBroken}</Badge>
  ) : (
    <Badge variant="muted">{t.statusNotConnected}</Badge>
  );

  const urlProblem = !view.communityUrl ? t.urlMissing : !view.urlRecognized ? t.urlUnrecognized : null;
  const storedProblem = view.mismatch ? t.mismatch : view.unreadable ? t.unreadable : null;

  return (
    <SectionCard
      title={t.title}
      description={t.desc}
      rightSlot={badge}
      footer={
        <>
          <AnimatePresence mode="wait">
            {busy ? (
              <motion.span
                key="busy"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-xs text-text-sec"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {status === "removing" ? t.removingLabel : t.savingLabel}
              </motion.span>
            ) : status === "saved" || status === "removed" ? (
              <motion.span
                key="done"
                initial={reduce ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-xs text-success-text"
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                {status === "saved" ? t.savedLabel : t.removedLabel}
              </motion.span>
            ) : status === "error" ? (
              <motion.span
                key="error"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-xs text-danger-text"
              >
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {errorMessage ?? t.errorLabel}
              </motion.span>
            ) : null}
          </AnimatePresence>
          {hasStored ? (
            <Button variant="ghost" size="sm" onClick={() => void request("DELETE")} disabled={busy}>
              {t.removeButton}
            </Button>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            onClick={() => void request("PUT")}
            disabled={busy || token.trim().length === 0 || urlProblem !== null}
          >
            {t.saveButton}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-text-sec">{t.communityLabel}</span>
        {view.communityUrl ? (
          <span className="break-all text-sm text-text-main">{view.communityUrl}</span>
        ) : null}
        {view.configured && view.community ? (
          <a
            href={view.community.chatUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-accent-text hover:underline"
          >
            {t.sendsAs(view.community.name || view.community.screenName)}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : null}
      </div>

      {urlProblem || storedProblem ? (
        <div className="rounded-xl border border-warning-border bg-warning-surface px-3 py-2 text-xs text-warning-text">
          {urlProblem ?? storedProblem}
        </div>
      ) : null}

      <div className="rounded-xl border border-border-subtle bg-bg-input/40 px-3 py-3">
        <p className="text-xs font-medium text-text-main">{t.stepsTitle}</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-text-sec">
          {t.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-text-sec">{t.tokenLabel}</span>
        <Input
          type="password"
          value={token}
          onChange={(event) => {
            setToken(event.target.value);
            if (status === "error") setStatus("idle");
          }}
          placeholder={t.tokenPlaceholder}
          autoComplete="off"
          spellCheck={false}
          maxLength={512}
          disabled={busy || urlProblem !== null}
        />
        <span className="text-[11px] text-text-sec">{t.tokenHint}</span>
      </label>
    </SectionCard>
  );
}
