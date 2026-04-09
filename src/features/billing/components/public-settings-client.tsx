"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Download, ExternalLink, Pencil, QrCode } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchWithAuth } from "@/lib/http/fetch-with-auth";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type Payload = {
  username: string;
  url: string;
};

type Props = {
  endpoint: string;
  name: string;
};

export function PublicSettingsClient({ endpoint, name }: Props) {
  const t = UI_TEXT.billing.publicPage;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [username, setUsername] = useState("");
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState("");

  const qrRef = useRef<HTMLCanvasElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(endpoint, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<Payload> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setUsername(json.data.username);
      setUrl(json.data.url);
      setDraft(json.data.username);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.saveFailed);
    } finally {
      setLoading(false);
    }
  }, [endpoint, t.saveFailed]);

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
      setError(t.saveFailed);
    }
  }, [url, t.saveFailed]);

  const handleSave = useCallback(async () => {
    const next = draft.trim();
    if (!next) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: next }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<Payload> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setUsername(json.data.username);
      setUrl(json.data.url);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.saveFailed);
    } finally {
      setSaving(false);
    }
  }, [draft, endpoint, t.saveFailed]);

  const handleDownloadQr = useCallback(() => {
    const canvas = qrRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `qr-${username || "profile"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [username]);

  const handleDownloadCard = useCallback(() => {
    const qrCanvas = qrRef.current;
    if (!qrCanvas) return;

    const CARD_W = 744;
    const CARD_H = 420;
    const PADDING = 48;
    const QR_SIZE = 220;

    const canvas = document.createElement("canvas");
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.fillStyle = "#18181b";
    ctx.roundRect(0, 0, CARD_W, CARD_H, 20);
    ctx.fill();

    // Accent bar
    ctx.fillStyle = "#a855f7";
    ctx.fillRect(0, 0, 6, CARD_H);

    // Name
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px system-ui, -apple-system, sans-serif";
    ctx.fillText(name, PADDING + 20, PADDING + 36);

    // URL
    ctx.fillStyle = "#a1a1aa";
    ctx.font = "18px system-ui, -apple-system, sans-serif";
    const displayUrl = url.replace("https://", "");
    ctx.fillText(displayUrl, PADDING + 20, PADDING + 72);

    // Platform name
    ctx.fillStyle = "#71717a";
    ctx.font = "14px system-ui, -apple-system, sans-serif";
    ctx.fillText("МастерРядом", PADDING + 20, CARD_H - PADDING);

    // QR
    const qrX = CARD_W - QR_SIZE - PADDING;
    const qrY = (CARD_H - QR_SIZE) / 2;
    ctx.fillStyle = "#ffffff";
    ctx.roundRect(qrX - 10, qrY - 10, QR_SIZE + 20, QR_SIZE + 20, 12);
    ctx.fill();
    ctx.drawImage(qrCanvas, qrX, qrY, QR_SIZE, QR_SIZE);

    const link = document.createElement("a");
    link.download = `card-${username || "profile"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [name, url, username]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-bg-card" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* URL Card */}
      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
        <div className="border-b border-border-subtle/60 px-4 py-3">
          <p className="text-sm font-semibold text-text-main">{t.usernameLabel}</p>
          <p className="text-xs text-text-sec">{t.usernameHint}</p>
        </div>

        <div className="space-y-3 p-4">
          {/* URL input with copy */}
          {url && (
            <div className="relative">
              <Input readOnly value={url} className="pr-20 font-mono text-xs" />
              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void handleCopy()}
                  title={t.copyLink}
                  aria-label={t.copyLink}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg p-1.5 text-text-sec transition-colors hover:bg-white/8 hover:text-text-main"
                  title={t.openProfile}
                  aria-label={t.openProfile}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          )}

          {/* Username edit */}
          {isEditing ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="min-w-0 flex-1"
                placeholder="studio-name"
                autoFocus
              />
              <Button
                size="sm"
                onClick={() => void handleSave()}
                disabled={saving || !draft.trim()}
              >
                {saving ? t.saving : t.saveUsername}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setDraft(username);
                  setIsEditing(false);
                }}
                disabled={saving}
              >
                {UI_TEXT.actions.cancel}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-sec">/u/{username || "—"}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(username);
                  setIsEditing(true);
                }}
                className="gap-1 text-xs text-text-sec"
              >
                <Pencil className="h-3.5 w-3.5" />
                {UI_TEXT.settings.publicLink.editUsername}
              </Button>
            </div>
          )}

          {copied && <p className="text-xs text-emerald-500">{t.copied}</p>}
          {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
        </div>
      </div>

      {/* QR Card */}
      {url && (
        <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
          <div className="border-b border-border-subtle/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <QrCode className="h-4 w-4 text-primary" aria-hidden />
              <p className="text-sm font-semibold text-text-main">{t.qrTitle}</p>
            </div>
            <p className="mt-0.5 text-xs text-text-sec">{t.qrHint}</p>
          </div>

          <div className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-start">
            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <QRCodeCanvas
                ref={qrRef}
                value={url}
                size={180}
                level="M"
                includeMargin={false}
              />
            </div>

            <div className="flex flex-col gap-2 sm:pt-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownloadQr}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                {t.downloadQr}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownloadCard}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                {t.downloadCard}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
