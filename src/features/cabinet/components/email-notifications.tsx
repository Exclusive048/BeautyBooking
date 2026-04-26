"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ModalSurface } from "@/components/ui/modal-surface";
import { fetchWithAuth } from "@/lib/http/fetch-with-auth";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type MeUser = {
  email: string | null;
  emailNotificationsEnabled: boolean;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function EmailNotificationsSection() {
  const t = UI_TEXT.settings.notifications.email;

  const [user, setUser] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/me", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ user: MeUser | null }> | null;
      if (json?.ok && json.data.user) {
        setUser({
          email: json.data.user.email,
          emailNotificationsEnabled: json.data.user.emailNotificationsEnabled,
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = useCallback(
    async (nextValue: boolean) => {
      if (!user?.email) return;
      setToggling(true);
      setError(null);
      try {
        const res = await fetchWithAuth("/api/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emailNotificationsEnabled: nextValue }),
        });
        const json = (await res.json().catch(() => null)) as ApiResponse<{ user: MeUser }> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : t.toggleFailed);
        }
        setUser((prev) => (prev ? { ...prev, emailNotificationsEnabled: nextValue } : prev));
      } catch (err) {
        setError(err instanceof Error ? err.message : t.toggleFailed);
      } finally {
        setToggling(false);
      }
    },
    [user?.email, t.toggleFailed]
  );

  if (loading) return null;

  return (
    <>
      <div className="lux-card rounded-[20px] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bg-input">
            <Mail className="h-4 w-4 text-text-sec" aria-hidden />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-text-main">{t.title}</div>

            {user?.email ? (
              <>
                <div className="mt-1 text-xs text-text-sec">
                  {t.notificationsTo}{" "}
                  <span className="font-medium text-text-main">{user.email}</span>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-sm text-text-main">{t.receiveToggle}</span>
                  <Switch
                    checked={user.emailNotificationsEnabled}
                    disabled={toggling}
                    onCheckedChange={(v) => void handleToggle(v)}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setDialogOpen(true)}
                  className="mt-2 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:rounded"
                >
                  {t.changeEmail}
                </button>
              </>
            ) : (
              <>
                <div className="mt-1 text-xs text-text-sec">{t.desc}</div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3 rounded-xl"
                  onClick={() => setDialogOpen(true)}
                >
                  {t.connect}
                </Button>
              </>
            )}

            {error ? (
              <div role="alert" className="mt-2 text-xs text-red-500">
                {error}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <EmailDialog
        open={dialogOpen}
        currentEmail={user?.email ?? null}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          void load();
          setDialogOpen(false);
        }}
      />
    </>
  );
}

function EmailDialog({
  open,
  currentEmail,
  onClose,
  onSaved,
}: {
  open: boolean;
  currentEmail: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = UI_TEXT.settings.notifications.email;
  const [email, setEmail] = useState(currentEmail ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEmail(currentEmail ?? "");
      setError(null);
    }
  }, [open, currentEmail]);

  const handleSave = useCallback(async () => {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setError(t.invalidEmail);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        const msg = json && !json.ok ? json.error.message : t.saveFailed;
        if (res.status === 409) {
          setError(t.emailTaken);
        } else {
          throw new Error(msg);
        }
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.saveFailed);
    } finally {
      setSaving(false);
    }
  }, [email, t, onSaved]);

  const title = currentEmail ? t.dialogTitleChange : t.dialogTitleConnect;

  return (
    <ModalSurface open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-text-sec">{t.dialogDesc}</p>

        <Input
          type="email"
          placeholder={t.placeholder}
          value={email}
          autoFocus
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !saving) void handleSave();
          }}
        />

        {error ? (
          <div role="alert" className="text-xs text-red-500">
            {error}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {UI_TEXT.actions.cancel}
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={saving || !email.trim()}
          >
            {saving ? UI_TEXT.status.saving : UI_TEXT.actions.save}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
