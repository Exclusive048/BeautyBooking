"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchWithAuth } from "@/lib/http/fetch-with-auth";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type PublicUsernamePayload = {
  username: string;
  url: string;
};

type Props = {
  endpoint: string;
};

const QR_SIZE = 200;
const QR_DOWNLOAD_SIZE = 1024;
const CARD_DOWNLOAD_WIDTH = 1024;
const CARD_DOWNLOAD_HEIGHT = 1024;
const BRAND_NAME = "МастерРядом";

export function ShareProfileSection({ endpoint }: Props) {
  const t = UI_TEXT.settings.shareProfile;
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchWithAuth(endpoint, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ApiResponse<PublicUsernamePayload> | null;
        if (!cancelled && json && json.ok) {
          setUrl(json.data.url);
          setUsername(json.data.username);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [endpoint]);

  const handleCopy = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard not available */
    }
  }, [url]);

  const handleDownloadQr = useCallback(() => {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas) return;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = QR_DOWNLOAD_SIZE;
    exportCanvas.height = QR_DOWNLOAD_SIZE;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, QR_DOWNLOAD_SIZE, QR_DOWNLOAD_SIZE);
    ctx.drawImage(canvas, 0, 0, QR_DOWNLOAD_SIZE, QR_DOWNLOAD_SIZE);

    const link = document.createElement("a");
    link.download = `qr-${username || "profile"}.png`;
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
  }, [username]);

  const handleDownloadCard = useCallback(() => {
    const canvas = document.createElement("canvas");
    canvas.width = CARD_DOWNLOAD_WIDTH;
    canvas.height = CARD_DOWNLOAD_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CARD_DOWNLOAD_WIDTH, CARD_DOWNLOAD_HEIGHT);

    const qrCanvas = qrRef.current?.querySelector("canvas");
    if (qrCanvas) {
      const qrSize = 560;
      const qrX = (CARD_DOWNLOAD_WIDTH - qrSize) / 2;
      const qrY = 120;
      ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
    }

    ctx.fillStyle = "#1e1e24";
    ctx.font = "bold 36px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(username ? `/u/${username}` : url, CARD_DOWNLOAD_WIDTH / 2, 760);

    ctx.fillStyle = "#a0a0a0";
    ctx.font = "24px sans-serif";
    ctx.fillText(BRAND_NAME, CARD_DOWNLOAD_WIDTH / 2, 810);

    ctx.fillStyle = "#c6a97e";
    ctx.font = "20px sans-serif";
    ctx.fillText(url, CARD_DOWNLOAD_WIDTH / 2, 860);

    const link = document.createElement("a");
    link.download = `card-${username || "profile"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [url, username]);

  if (loading) {
    return <div className="p-4 text-sm text-text-sec">{UI_TEXT.common.loading}</div>;
  }

  if (!url) return null;

  return (
    <div className="space-y-4 p-4">
      {/* URL with copy */}
      <div>
        <label className="mb-1.5 block text-xs text-text-sec">{t.yourLink}</label>
        <div className="relative">
          <Input readOnly value={url} className="pr-12" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void handleCopy()}
            title={UI_TEXT.settings.publicLink.copy}
            aria-label={UI_TEXT.settings.publicLink.copy}
            className="absolute right-2 top-1/2 -translate-y-1/2"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        {copied ? <p className="mt-1 text-xs text-text-sec">{t.copied}</p> : null}
      </div>

      {/* QR Code */}
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border-subtle bg-white p-6 dark:bg-white">
        <div ref={qrRef}>
          <QRCodeCanvas
            value={url}
            size={QR_SIZE}
            level="M"
            marginSize={2}
            bgColor="#ffffff"
            fgColor="#1e1e24"
          />
        </div>
      </div>

      {/* Download buttons */}
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={handleDownloadQr}>
          <Download className="mr-1.5 h-4 w-4" />
          {t.downloadQr}
        </Button>
        <Button variant="secondary" size="sm" className="flex-1" onClick={handleDownloadCard}>
          <Download className="mr-1.5 h-4 w-4" />
          {t.downloadCard}
        </Button>
      </div>
    </div>
  );
}
