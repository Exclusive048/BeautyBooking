"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Download, ExternalLink, Pencil, QrCode, Smartphone } from "lucide-react";
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
  tagline?: string;
  address?: string;
  bio?: string;
  avatarUrl?: string | null;
};

// ─── Canvas helpers ────────────────────────────────────────────────

function loadCanvasImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawCircleAvatar(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  cx: number,
  cy: number,
  r: number,
  initial: string
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  if (img) {
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  } else {
    const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    grad.addColorStop(0, "#ede9fe");
    grad.addColorStop(1, "#fce7f3");
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = "#7c3aed";
    ctx.font = `bold ${Math.round(r * 0.9)}px system-ui,-apple-system,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initial, cx, cy);
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// ─── Horizontal card (1050×600, for print) ──────────────────────

async function renderHorizontalCard(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  data: {
    name: string;
    hashtag: string;
    address: string;
    bio: string;
    avatarImg: HTMLImageElement | null;
    profileUrl: string;
    qrCanvas: HTMLCanvasElement;
  }
): Promise<void> {
  const { name, hashtag, address, bio, avatarImg, profileUrl, qrCanvas } = data;
  const PAD = 56;
  const AVATAR_R = 56;
  const AVATAR_CX = PAD + AVATAR_R;
  const AVATAR_CY = Math.round(H * 0.38);
  const TEXT_X = AVATAR_CX + AVATAR_R + 28;
  const QR_SIZE = 180;
  const QR_X = W - PAD - QR_SIZE;
  const QR_Y = H - PAD - QR_SIZE;

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Left accent bar (gradient violet→pink)
  const accentGrad = ctx.createLinearGradient(0, 0, 0, H);
  accentGrad.addColorStop(0, "#7c3aed");
  accentGrad.addColorStop(1, "#ec4899");
  ctx.fillStyle = accentGrad;
  ctx.fillRect(0, 0, 8, H);

  // Top accent line (thin)
  const topGrad = ctx.createLinearGradient(0, 0, W, 0);
  topGrad.addColorStop(0, "#7c3aed");
  topGrad.addColorStop(1, "#ec4899");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, W, 4);

  // Avatar
  drawCircleAvatar(ctx, avatarImg, AVATAR_CX, AVATAR_CY, AVATAR_R, name.charAt(0).toUpperCase());

  // Name
  const nameFont = name.length > 20 ? 30 : 36;
  ctx.fillStyle = "#111827";
  ctx.font = `bold ${nameFont}px system-ui,-apple-system,sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(truncate(name, 30), TEXT_X, AVATAR_CY - AVATAR_R + 4);

  // Hashtag
  if (hashtag.trim()) {
    ctx.fillStyle = "#7c3aed";
    ctx.font = "22px system-ui,-apple-system,sans-serif";
    const tag = hashtag.startsWith("#") ? hashtag : `#${hashtag}`;
    ctx.fillText(truncate(tag, 40), TEXT_X, AVATAR_CY - AVATAR_R + nameFont + 12);
  }

  // Address
  if (address.trim()) {
    ctx.fillStyle = "#6b7280";
    ctx.font = "20px system-ui,-apple-system,sans-serif";
    ctx.fillText(`📍 ${truncate(address, 50)}`, TEXT_X, AVATAR_CY + 6);
  }

  // Bio
  if (bio.trim()) {
    ctx.fillStyle = "#374151";
    ctx.font = "18px system-ui,-apple-system,sans-serif";
    ctx.fillText(truncate(bio, 72), TEXT_X, AVATAR_CY + 36);
  }

  // QR white background chip
  ctx.fillStyle = "#f9fafb";
  ctx.beginPath();
  ctx.roundRect(QR_X - 12, QR_Y - 12, QR_SIZE + 24, QR_SIZE + 24, 16);
  ctx.fill();
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // QR code
  ctx.drawImage(qrCanvas, QR_X, QR_Y, QR_SIZE, QR_SIZE);

  // URL
  ctx.fillStyle = "#7c3aed";
  ctx.font = "20px system-ui,-apple-system,sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(profileUrl, PAD + 20, H - PAD + 4);

  // Brand name
  ctx.fillStyle = "#9ca3af";
  ctx.font = "15px system-ui,-apple-system,sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("МастерРядом", W / 2, H - 12);
}

// ─── Vertical card (1080×1920, for socials) ─────────────────────

async function renderVerticalCard(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  data: {
    name: string;
    hashtag: string;
    address: string;
    bio: string;
    avatarImg: HTMLImageElement | null;
    profileUrl: string;
    username: string;
    qrCanvas: HTMLCanvasElement;
  }
): Promise<void> {
  const { name, hashtag, address, bio, avatarImg, profileUrl, username, qrCanvas } = data;
  const s = W / 1080;

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Top gradient accent bar
  const topGrad = ctx.createLinearGradient(0, 0, W, 0);
  topGrad.addColorStop(0, "#7c3aed");
  topGrad.addColorStop(1, "#ec4899");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, W, 10 * s);

  // Brand
  ctx.fillStyle = "#7c3aed";
  ctx.font = `600 ${28 * s}px system-ui,-apple-system,sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("МастерРядом", W / 2, 50 * s);

  // Avatar
  const AVATAR_R = 120 * s;
  const AVATAR_CX = W / 2;
  const AVATAR_CY = 240 * s;
  drawCircleAvatar(ctx, avatarImg, AVATAR_CX, AVATAR_CY, AVATAR_R, name.charAt(0).toUpperCase());

  // Name
  ctx.fillStyle = "#111827";
  ctx.font = `bold ${52 * s}px system-ui,-apple-system,sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(truncate(name, 28), W / 2, 400 * s);

  // Hashtag
  if (hashtag.trim()) {
    ctx.fillStyle = "#7c3aed";
    ctx.font = `${32 * s}px system-ui,-apple-system,sans-serif`;
    const tag = hashtag.startsWith("#") ? hashtag : `#${hashtag}`;
    ctx.fillText(truncate(tag, 36), W / 2, 466 * s);
  }

  // Divider
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(80 * s, 520 * s, W - 160 * s, 1.5 * s);

  let curY = 560 * s;

  // Address
  if (address.trim()) {
    ctx.fillStyle = "#6b7280";
    ctx.font = `${30 * s}px system-ui,-apple-system,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`📍 ${truncate(address, 48)}`, W / 2, curY);
    curY += 60 * s;
  }

  // Bio
  if (bio.trim()) {
    const lines = wrapText(ctx, truncate(bio, 120), W - 160 * s, `${28 * s}px system-ui,-apple-system,sans-serif`);
    ctx.fillStyle = "#374151";
    ctx.font = `${28 * s}px system-ui,-apple-system,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const line of lines.slice(0, 4)) {
      ctx.fillText(line, W / 2, curY);
      curY += 42 * s;
    }
    curY += 12 * s;
  }

  // Divider 2
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(80 * s, curY, W - 160 * s, 1.5 * s);
  curY += 40 * s;

  // "Записаться:" label
  ctx.fillStyle = "#9ca3af";
  ctx.font = `${26 * s}px system-ui,-apple-system,sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Записаться:", W / 2, curY);
  curY += 40 * s;

  // URL
  ctx.fillStyle = "#7c3aed";
  ctx.font = `600 ${28 * s}px system-ui,-apple-system,sans-serif`;
  ctx.fillText(profileUrl, W / 2, curY);
  curY += 70 * s;

  // QR code
  const QR_SIZE = 280 * s;
  const QR_X = (W - QR_SIZE) / 2;
  ctx.fillStyle = "#f9fafb";
  ctx.beginPath();
  ctx.roundRect(QR_X - 16 * s, curY - 16 * s, QR_SIZE + 32 * s, QR_SIZE + 32 * s, 20 * s);
  ctx.fill();
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.drawImage(qrCanvas, QR_X, curY, QR_SIZE, QR_SIZE);

  // Username under QR
  ctx.fillStyle = "#9ca3af";
  ctx.font = `${22 * s}px system-ui,-apple-system,sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(`@${username}`, W / 2, curY + QR_SIZE + 24 * s);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: string): string[] {
  ctx.font = font;
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ─── Component ────────────────────────────────────────────────────

export function PublicSettingsClient({
  endpoint,
  name,
  tagline = "",
  address = "",
  bio = "",
  avatarUrl = null,
}: Props) {
  const t = UI_TEXT.billing.publicPage;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [username, setUsername] = useState("");
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cardGenerating, setCardGenerating] = useState(false);

  // Hidden QR canvas for export (larger size for crisp output)
  const qrExportRef = useRef<HTMLCanvasElement>(null);
  // Visible QR canvas for UI display
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

  // Build business card data, render preview
  const buildCardData = useCallback(async () => {
    if (!url || !username) return null;
    const profileUrl = url.replace(/^https?:\/\//, "");
    const avatarImg = avatarUrl ? await loadCanvasImage(avatarUrl) : null;
    const qrCanvas = qrExportRef.current;
    if (!qrCanvas) return null;
    return {
      name: name || username,
      hashtag: tagline,
      address,
      bio,
      avatarImg,
      profileUrl,
      username,
      qrCanvas,
    };
  }, [url, username, name, tagline, address, bio, avatarUrl]);

  // Generate preview (horizontal card at reduced scale)
  useEffect(() => {
    if (!url || !username) return;
    let cancelled = false;
    void (async () => {
      // Small delay to let QR canvas render
      await new Promise((r) => setTimeout(r, 120));
      if (cancelled) return;

      const data = await buildCardData();
      if (!data || cancelled) return;

      const SCALE = 0.45;
      const W = Math.round(1050 * SCALE);
      const H = Math.round(600 * SCALE);
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(SCALE, SCALE);
      await renderHorizontalCard(ctx, 1050, 600, data);
      canvas.toBlob((blob) => {
        if (cancelled || !blob) return;
        const newUrl = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return newUrl;
        });
      }, "image/png");
    })();
    return () => { cancelled = true; };
  }, [url, username, buildCardData]);

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
    const exportCanvas = document.createElement("canvas");
    const SIZE = 1024;
    exportCanvas.width = SIZE;
    exportCanvas.height = SIZE;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(canvas, 0, 0, SIZE, SIZE);
    const link = document.createElement("a");
    link.download = `qr-${username || "profile"}.png`;
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
  }, [username]);

  const handleDownloadCard = useCallback(async () => {
    setCardGenerating(true);
    try {
      const data = await buildCardData();
      if (!data) return;
      const canvas = document.createElement("canvas");
      const W = 1050;
      const H = 600;
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await renderHorizontalCard(ctx, W, H, data);
      const link = document.createElement("a");
      link.download = `card-${username || "profile"}.png`;
      link.href = canvas.toDataURL("image/png", 0.95);
      link.click();
    } finally {
      setCardGenerating(false);
    }
  }, [buildCardData, username]);

  const handleDownloadVertical = useCallback(async () => {
    setCardGenerating(true);
    try {
      const data = await buildCardData();
      if (!data) return;
      const canvas = document.createElement("canvas");
      const W = 1080;
      const H = 1920;
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await renderVerticalCard(ctx, W, H, data);
      const link = document.createElement("a");
      link.download = `card-social-${username || "profile"}.png`;
      link.href = canvas.toDataURL("image/png", 0.95);
      link.click();
    } finally {
      setCardGenerating(false);
    }
  }, [buildCardData, username]);

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
          {url ? (
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
                  className="rounded-lg p-1.5 text-text-sec transition-colors hover:bg-bg-input hover:text-text-main"
                  title={t.openProfile}
                  aria-label={t.openProfile}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          ) : null}

          {isEditing ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="min-w-0 flex-1"
                placeholder="master-name"
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

          {copied ? <p className="text-xs text-emerald-500">{t.copied}</p> : null}
          {error ? <p role="alert" className="text-xs text-red-500">{error}</p> : null}
        </div>
      </div>

      {url ? (
        <>
          {/* QR Card */}
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
              </div>
            </div>
          </div>

          {/* Business Card */}
          <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
            <div className="border-b border-border-subtle/60 px-4 py-3">
              <p className="text-sm font-semibold text-text-main">{t.cardSectionTitle}</p>
              <p className="mt-0.5 text-xs text-text-sec">{t.cardSectionHint}</p>
            </div>

            <div className="p-4 space-y-4">
              {/* Live preview */}
              {previewUrl ? (
                <div className="rounded-xl border border-border-subtle bg-bg-input/50 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- blob URL, next/image doesn't support it */}
                  <img
                    src={previewUrl}
                    alt={t.cardPreviewAlt}
                    className="w-full rounded-lg shadow-sm"
                    style={{ maxHeight: 260, objectFit: "contain" }}
                  />
                </div>
              ) : (
                <div className="flex h-32 items-center justify-center rounded-xl border border-border-subtle bg-bg-input/50 text-xs text-text-sec">
                  {t.cardGenerating}
                </div>
              )}

              {/* Download buttons */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleDownloadCard()}
                  disabled={cardGenerating}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  {t.downloadCard}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleDownloadVertical()}
                  disabled={cardGenerating}
                  className="gap-2"
                >
                  <Smartphone className="h-4 w-4" />
                  {t.downloadCardSocial}
                </Button>
              </div>
            </div>
          </div>

          {/* Hidden export QR (large size for crisp card output) */}
          <div className="sr-only" aria-hidden="true">
            <QRCodeCanvas
              ref={qrExportRef}
              value={url}
              size={400}
              level="M"
              includeMargin={false}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
