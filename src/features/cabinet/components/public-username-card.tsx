"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ModalSurface } from "@/components/ui/modal-surface";
import type { ApiResponse } from "@/lib/types/api";

type PublicUsernamePayload = {
  username: string;
  url: string;
};

type Props = {
  endpoint: string;
};

const RULES_TEXT = "a-z, 0-9, дефис, 3–32";

export function PublicUsernameCard({ endpoint }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [url, setUrl] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const canAct = Boolean(url && username);
  const usernamePlaceholder = endpoint.includes("/studio/") ? "my-studio" : "anna-manicure";

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<PublicUsernamePayload> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setUsername(json.data.username);
      setUrl(json.data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить публичную ссылку.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const openModal = useCallback(() => {
    setDraft(username);
    setError(null);
    setModalOpen(true);
  }, [username]);

  const closeModal = useCallback(() => {
    if (saving) return;
    setModalOpen(false);
  }, [saving]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2500);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showNotice("Ссылка скопирована.");
    } catch {
      showNotice("Не удалось скопировать ссылку.");
    }
  }, [showNotice, url]);

  const handleOpen = useCallback(() => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [url]);

  const submitDisabled = useMemo(() => saving || !draft.trim(), [draft, saving]);

  const handleSubmit = useCallback(async () => {
    const next = draft.trim();
    if (!next) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: next }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<PublicUsernamePayload> | null;
      if (res.status === 409) {
        setError("Этот username уже занят. Попробуйте другой.");
        return;
      }
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setUsername(json.data.username);
      setUrl(json.data.url);
      setModalOpen(false);
      showNotice("Публичная ссылка обновлена.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось изменить username.");
    } finally {
      setSaving(false);
    }
  }, [draft, endpoint, showNotice]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-bg-card/90 p-4 text-sm text-text-sec">
        Загрузка публичной ссылки...
      </div>
    );
  }

  return (
    <section className="rounded-2xl bg-bg-card/90 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Публичная ссылка</h3>
          <p className="mt-1 text-xs text-text-sec">
            Используйте эту ссылку для клиента и продвижения.
          </p>
        </div>
        {notice ? <div className="text-xs text-emerald-400">{notice}</div> : null}
      </div>

      {error ? <div className="mt-3 rounded-xl bg-rose-500/10 p-3 text-xs text-rose-200">{error}</div> : null}

      <div className="mt-3 rounded-xl border border-border-subtle bg-bg-input/70 p-3 text-sm text-text-main">
        <div className="text-xs text-text-sec">Username</div>
        <div className="mt-1 font-semibold">{username || "—"}</div>
        <div className="mt-3 text-xs text-text-sec">Полная ссылка</div>
        <div className="mt-1 truncate text-sm">{url || "—"}</div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleCopy}
          disabled={!canAct}
          className="rounded-xl border border-border-subtle bg-bg-input px-4 py-2 text-sm text-text-main transition hover:bg-bg-card disabled:opacity-60"
        >
          Скопировать ссылку
        </button>
        <button
          type="button"
          onClick={handleOpen}
          disabled={!canAct}
          className="rounded-xl border border-border-subtle bg-bg-input px-4 py-2 text-sm text-text-main transition hover:bg-bg-card disabled:opacity-60"
        >
          Открыть
        </button>
        <button
          type="button"
          onClick={openModal}
          disabled={!canAct}
          className="rounded-xl border border-border-subtle bg-bg-input px-4 py-2 text-sm text-text-main transition hover:bg-bg-card disabled:opacity-60"
        >
          Изменить username
        </button>
      </div>

      <ModalSurface open={modalOpen} onClose={closeModal} title="Изменить username">
        <div className="space-y-3">
          <label className="text-xs text-text-sec">
            Новый username
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="mt-1 w-full rounded-lg border border-transparent bg-bg-input px-3 py-2 text-sm text-text-main outline-none transition focus:border-border-subtle"
              placeholder={usernamePlaceholder}
            />
          </label>
          <div className="text-xs text-text-sec">Правила: {RULES_TEXT}</div>
          <div className="rounded-xl bg-bg-input/70 p-3 text-xs text-text-sec">
            После изменения старая ссылка будет перенаправлять на новую.
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeModal}
              disabled={saving}
              className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm text-text-main transition hover:bg-bg-card disabled:opacity-60"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitDisabled}
              className="rounded-lg bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-3 py-2 text-sm text-[rgb(var(--accent-foreground))] disabled:opacity-60"
            >
              Подтвердить
            </button>
          </div>
        </div>
      </ModalSurface>
    </section>
  );
}
