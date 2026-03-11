"use client";

import { Check, Copy, ExternalLink, Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type PublicUsernamePayload = {
  username: string;
  url: string;
};

type Props = {
  endpoint: string;
};

export function PublicUsernameCard({ endpoint }: Props) {
  const settingsText = UI_TEXT.settings;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [username, setUsername] = useState("");
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState("");

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { cache: "no-store", credentials: "include" });
      const json = (await res.json().catch(() => null)) as ApiResponse<PublicUsernamePayload> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setUsername(json.data.username);
      setUrl(json.data.url);
      setDraft(json.data.username);
    } catch (err) {
      setError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.updateSettings);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCopy = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(UI_TEXT.master.profile.errors.saveFailed);
    }
  }, [url]);

  const submitDisabled = useMemo(() => saving || !draft.trim(), [draft, saving]);

  const handleSubmit = useCallback(async (): Promise<void> => {
    const next = draft.trim();
    if (!next) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: next }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<PublicUsernamePayload> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setUsername(json.data.username);
      setUrl(json.data.url);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.saveFailed);
    } finally {
      setSaving(false);
    }
  }, [draft, endpoint]);

  const publicPath = username ? `/u/${username}` : "/u/";

  if (loading) {
    return <div className="p-4 text-sm text-text-sec">{UI_TEXT.common.loading}</div>;
  }

  return (
    <div className="space-y-3 p-4">
      <div className="relative">
        <input
          readOnly
          value={url}
          className="h-10 w-full rounded-xl border border-border-subtle bg-bg-input px-3 pr-20 text-sm text-text-sec outline-none"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="rounded-lg p-1.5 text-text-sec transition-colors hover:bg-white/8 hover:text-text-main"
            title={settingsText.publicLink.copy}
            aria-label={settingsText.publicLink.copy}
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg p-1.5 text-text-sec transition-colors hover:bg-white/8 hover:text-text-main"
            title={settingsText.publicLink.open}
            aria-label={settingsText.publicLink.open}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isEditing ? (
          <>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-xl border border-border-subtle bg-bg-input px-3 text-sm text-text-main outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="anna-manicure"
              autoFocus
            />
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitDisabled}
              className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              {UI_TEXT.actions.save}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(username);
                setIsEditing(false);
              }}
              disabled={saving}
              className="shrink-0 rounded-xl bg-white/8 px-3 py-2 text-xs text-text-sec transition-colors hover:bg-white/12"
            >
              {UI_TEXT.actions.cancel}
            </button>
          </>
        ) : (
          <>
            <span className="text-sm text-text-sec">{publicPath}</span>
            <button
              type="button"
              onClick={() => {
                setDraft(username);
                setIsEditing(true);
              }}
              className="inline-flex items-center gap-1 text-xs text-text-sec transition-colors hover:text-text-main"
            >
              <Pencil className="h-3.5 w-3.5" />
              {settingsText.publicLink.editUsername}
            </button>
          </>
        )}
      </div>

      {error ? <div className="text-xs text-rose-400">{error}</div> : null}
      {copied ? <div className="text-xs text-text-sec">{settingsText.publicLink.copied}</div> : null}
    </div>
  );
}
