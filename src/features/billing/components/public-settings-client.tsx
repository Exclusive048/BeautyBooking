"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Pencil,
  QrCode,
  Share2,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { QrCodeCanvas } from "@/components/ui/qr-code-canvas";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/toast";
import {
  canvasToBlob,
  downloadFromUrl,
  ensureCardFonts,
  loadCardImage,
  readQrFromCanvas,
  resolveCardFontFamily,
  shareCardImage,
  waitForQr,
} from "@/features/billing/lib/business-card/browser";
import {
  BUSINESS_CARD_FORMATS,
  renderBusinessCard,
  renderQrImage,
  type BusinessCardFormat,
} from "@/features/billing/lib/business-card/render";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";

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

type CardImage = { blob: Blob; href: string };

/**
 * Готовые картинки визитки для одного набора данных (`key`). Обе формы
 * рисуются сразу и заранее: «Поделиться» обязано вызвать `navigator.share`
 * прямо в нажатии, а Safari теряет жест на первом же ожидании — рисовать на
 * клике нельзя.
 */
type CardState = {
  key: string;
  images: Record<BusinessCardFormat, CardImage> | null;
  failed: boolean;
};

const QR_EXPORT_SIZE = 1024;

function cardFileName(format: BusinessCardFormat, username: string): string {
  const stem = username || "profile";
  return format === "print" ? `masterryadom-vizitka-${stem}.png` : `masterryadom-stories-${stem}.png`;
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
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [username, setUsername] = useState("");
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState("");
  const [format, setFormat] = useState<BusinessCardFormat>("print");
  const [card, setCard] = useState<CardState | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // Скрытый крупный QR — источник матрицы модулей для визитки и «Скачать QR».
  const qrExportRef = useRef<HTMLCanvasElement>(null);
  // Видимый QR в карточке «QR-код профиля».
  const qrRef = useRef<HTMLCanvasElement>(null);
  // Blob-ссылки показанных картинок: освобождаются при замене и при уходе со страницы.
  const issuedHrefsRef = useRef<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJsonWithAuth<Payload>(endpoint, { cache: "no-store" });
      setUsername(data.username);
      setUrl(data.url);
      setDraft(data.username);
    } catch (err) {
      setError(serverMessageOr(err, t.saveFailed));
    } finally {
      setLoading(false);
    }
  }, [endpoint, t.saveFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayName = name || username;
  const cardKey = [url, displayName, tagline, address, bio, avatarUrl ?? "", retryNonce].join("\n");

  // Обе формы визитки рисуются, как только известен адрес страницы.
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const created: string[] = [];
    void (async () => {
      try {
        const fontFamily = resolveCardFontFamily();
        const [qr, avatar] = await Promise.all([
          waitForQr(() => qrExportRef.current, () => cancelled),
          avatarUrl ? loadCardImage(avatarUrl) : Promise.resolve(null),
          ensureCardFonts(fontFamily),
        ]);
        if (cancelled) return;
        const content = { name: displayName, tagline, address, bio, profileUrl: url, avatar, qr, fontFamily };
        const images = {} as Record<BusinessCardFormat, CardImage>;
        for (const cardFormat of BUSINESS_CARD_FORMATS) {
          const blob = await canvasToBlob(renderBusinessCard(cardFormat, content));
          if (cancelled) return;
          const href = URL.createObjectURL(blob);
          created.push(href);
          images[cardFormat] = { blob, href };
        }
        const previous = issuedHrefsRef.current;
        issuedHrefsRef.current = created.splice(0);
        setCard({ key: cardKey, images, failed: false });
        previous.forEach((href) => URL.revokeObjectURL(href));
      } catch {
        if (!cancelled) setCard({ key: cardKey, images: null, failed: true });
      }
    })();
    return () => {
      cancelled = true;
      created.forEach((href) => URL.revokeObjectURL(href));
    };
  }, [cardKey, url, displayName, tagline, address, bio, avatarUrl]);

  useEffect(
    () => () => {
      issuedHrefsRef.current.forEach((href) => URL.revokeObjectURL(href));
      issuedHrefsRef.current = [];
    },
    [],
  );

  const currentCard = card?.key === cardKey ? card : null;
  const cardImage = currentCard?.images?.[format] ?? null;
  const cardFailed = currentCard?.failed ?? false;

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
      const data = await fetchJsonWithAuth<Payload>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: next }),
      });
      setUsername(data.username);
      setUrl(data.url);
      setIsEditing(false);
    } catch (err) {
      setError(serverMessageOr(err, t.saveFailed));
    } finally {
      setSaving(false);
    }
  }, [draft, endpoint, t.saveFailed]);

  const handleDownloadQr = useCallback(() => {
    const qr = readQrFromCanvas(qrExportRef.current) ?? qrRef.current;
    if (!qr) return;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = QR_EXPORT_SIZE;
    exportCanvas.height = QR_EXPORT_SIZE;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;
    renderQrImage(ctx, qr, QR_EXPORT_SIZE);
    downloadFromUrl(exportCanvas.toDataURL("image/png"), `masterryadom-qr-${username || "profile"}.png`);
  }, [username]);

  const handleDownloadCard = useCallback(() => {
    if (!cardImage) return;
    downloadFromUrl(cardImage.href, cardFileName(format, username));
  }, [cardImage, format, username]);

  const copyProfileLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t.shareLinkCopied);
    } catch {
      toast.error(t.shareFailed);
    }
  }, [url, toast, t.shareLinkCopied, t.shareFailed]);

  const handleShareCard = useCallback(async () => {
    if (!cardImage) return;
    // Без ожиданий до `navigator.share` — иначе Safari сочтёт вызов не жестом.
    const outcome = await shareCardImage({
      blob: cardImage.blob,
      filename: cardFileName(format, username),
      title: displayName,
      url,
    });
    if (outcome === "unsupported") await copyProfileLink();
  }, [cardImage, format, username, displayName, url, copyProfileLink]);

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
                    <Check className="h-4 w-4 text-success-text" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="-m-2 rounded-lg p-3.5 text-text-sec transition-colors hover:bg-bg-input hover:text-text-main"
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

          {copied ? <p className="text-xs text-success-text">{t.copied}</p> : null}
          {error ? <p role="alert" className="text-xs text-danger-text">{error}</p> : null}
        </div>
      </div>

      {url ? (
        <>
          {/* QR Card */}
          <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
            <div className="border-b border-border-subtle/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-accent-text" aria-hidden />
                <p className="text-sm font-semibold text-text-main">{t.qrTitle}</p>
              </div>
              <p className="mt-0.5 text-xs text-text-sec">{t.qrHint}</p>
            </div>

            <div className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-start">
              <div className="rounded-2xl bg-white p-3 shadow-sm">
                <QrCodeCanvas
                  canvasRef={qrRef}
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

            <div className="space-y-4 p-4">
              <SegmentedTabs
                value={format}
                onChange={setFormat}
                ariaLabel={t.cardFormatLabel}
                className="sm:max-w-sm"
                options={[
                  {
                    value: "print",
                    label: t.cardFormatPrint,
                    icon: <CreditCard className="h-4 w-4" aria-hidden />,
                    testId: "business-card-format-print",
                  },
                  {
                    value: "story",
                    label: t.cardFormatStory,
                    icon: <Smartphone className="h-4 w-4" aria-hidden />,
                    testId: "business-card-format-story",
                  },
                ]}
              />

              <div className="flex justify-center rounded-2xl bg-bg-input/50 p-4 sm:p-6">
                {cardImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- blob-ссылка на картинку с холста: next/image её не оптимизирует
                  <img
                    src={cardImage.href}
                    alt={t.cardPreviewAlt}
                    data-testid="business-card-preview"
                    className={cn(
                      "shadow-card",
                      format === "print"
                        ? "w-full max-w-xl rounded-lg"
                        : "h-96 w-auto rounded-2xl sm:h-[30rem]",
                    )}
                  />
                ) : cardFailed ? (
                  <div className="flex w-full max-w-xl flex-col items-start gap-3">
                    <Notice tone="danger" className="w-full">
                      {t.cardFailed}
                    </Notice>
                    <Button variant="secondary" size="sm" onClick={() => setRetryNonce((n) => n + 1)}>
                      {t.cardRetry}
                    </Button>
                  </div>
                ) : (
                  <div role="status" className="flex w-full justify-center">
                    <Skeleton
                      className={cn(
                        format === "print"
                          ? "aspect-[9/5] w-full max-w-xl rounded-lg"
                          : "aspect-[9/16] h-96 rounded-2xl sm:h-[30rem]",
                      )}
                    />
                    <span className="sr-only">{t.cardGenerating}</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-text-sec">
                {format === "print" ? t.cardFormatPrintNote : t.cardFormatStoryNote}
              </p>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => void handleShareCard()}
                  disabled={!cardImage}
                  className="gap-2"
                  data-testid="business-card-share"
                >
                  <Share2 className="h-4 w-4" aria-hidden />
                  {t.shareCard}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDownloadCard}
                  disabled={!cardImage}
                  className="gap-2"
                  data-testid="business-card-download"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  {t.downloadCard}
                </Button>
              </div>
            </div>
          </div>

          {/* Скрытый крупный QR: из него читается матрица модулей */}
          <div className="sr-only" aria-hidden="true">
            <QrCodeCanvas
              canvasRef={qrExportRef}
              value={url}
              size={512}
              level="M"
              includeMargin={false}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
