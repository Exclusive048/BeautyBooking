/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { X, Upload, RotateCcw, Sparkles, Star } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { ModalSurface } from "@/components/ui/modal-surface";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";
import type { VisualSearchHttpResponse } from "@/lib/visual-search/contracts";
import { VISUAL_CATEGORY_LABELS } from "@/lib/visual-search/prompt";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type Props = {
  open: boolean;
  onClose: () => void;
};

function validateFile(file: File): string | null {
  if (!ACCEPTED_MIME_TYPES.has(file.type) || file.size > MAX_IMAGE_SIZE_BYTES) {
    return UI_TEXT.home.visualSearch.messages.invalidFile;
  }
  return null;
}

export function VisualSearchModal({ open, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [response, setResponse] = useState<VisualSearchHttpResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    if (open) return;
    setIsDragging(false);
    setSelectedFile(null);
    setPreview(null);
    setIsSearching(false);
    setResponse(null);
    setError(null);
  }, [open]);

  function selectFile(file: File | null): void {
    if (!file) return;
    const validationError = validateFile(file);
    if (validationError) {
      setSelectedFile(null);
      setResponse(null);
      setError(validationError);
      setPreview(null);
      return;
    }
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
    setResponse(null);
    setError(null);
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>): void {
    selectFile(e.target.files?.[0] ?? null);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setIsDragging(false);
    selectFile(e.dataTransfer.files?.[0] ?? null);
  }

  function handleReset(): void {
    setSelectedFile(null);
    setPreview(null);
    setResponse(null);
    setError(null);
  }

  async function runSearch(): Promise<void> {
    if (!selectedFile) {
      setError(UI_TEXT.home.visualSearch.messages.fileRequired);
      return;
    }
    setIsSearching(true);
    setError(null);
    setResponse(null);

    try {
      const formData = new FormData();
      formData.append("image", selectedFile);
      const res = await fetch("/api/visual-search", {
        method: "POST",
        body: formData,
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<VisualSearchHttpResponse> | null;

      if (!res.ok || !json || !json.ok) {
        setError(
          json && !json.ok
            ? json.error.message
            : UI_TEXT.home.visualSearch.messages.searchFailed
        );
        return;
      }
      setResponse(json.data);
    } catch {
      setError(UI_TEXT.home.visualSearch.messages.searchFailed);
    } finally {
      setIsSearching(false);
    }
  }

  const detectedCategoryLabel =
    response?.ok ? (VISUAL_CATEGORY_LABELS[response.category] ?? response.category) : null;

  const hasResults = response?.ok && response.results.length > 0;
  const noResults = response?.ok && response.results.length === 0;

  return (
    <ModalSurface open={open} onClose={onClose} className="max-w-xl">
      <div className="flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#c6a97e]/12 ring-1 ring-[#c6a97e]/20">
              <Sparkles className="h-4 w-4 text-[#c6a97e]" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none text-text-main">
                {UI_TEXT.home.visualSearch.modalTitle}
              </p>
              <p className="mt-1 text-[11px] leading-none text-text-sec">
                {UI_TEXT.home.visualSearch.modalSubtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={UI_TEXT.common.close}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-sec transition-colors hover:bg-white/8 hover:text-text-main"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="h-px bg-white/6 mx-5" />

        <div className="p-5 space-y-3">

          {/* Upload zone */}
          {!preview ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={[
                "relative flex cursor-pointer flex-col items-center justify-center gap-3",
                "rounded-2xl border-2 border-dashed py-9 px-6 text-center",
                "transition-all duration-150 select-none",
                isDragging
                  ? "border-[#c6a97e]/50 bg-[#c6a97e]/5"
                  : "border-white/8 bg-white/2 hover:border-white/16 hover:bg-white/4",
              ].join(" ")}
            >
              <div className={[
                "flex h-11 w-11 items-center justify-center rounded-2xl transition-colors",
                isDragging ? "bg-[#c6a97e]/15" : "bg-white/6",
              ].join(" ")}>
                <Upload className={[
                  "h-5 w-5 transition-colors",
                  isDragging ? "text-[#c6a97e]" : "text-text-sec",
                ].join(" ")} />
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-text-main">
                  {isDragging
                    ? UI_TEXT.home.visualSearch.dropzoneRelease
                    : UI_TEXT.home.visualSearch.dropzoneTitle}
                </p>
                <p className="text-xs text-text-sec">
                  {UI_TEXT.home.visualSearch.dropzoneSubtitle}
                </p>
              </div>

              <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-text-main transition-colors hover:bg-white/10">
                {UI_TEXT.home.visualSearch.chooseFile}
              </span>
              <p className="text-[11px] text-text-sec/60">
                {UI_TEXT.home.visualSearch.fileRequirements}
              </p>

              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleInputChange}
              />
            </div>
          ) : (
            /* Preview */
            <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-black/20">
              <img
                src={preview}
                alt="Preview"
                className="max-h-60 w-full object-contain"
              />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/65 to-transparent px-3.5 py-3">
                <span className="max-w-[60%] truncate text-xs text-white/60">
                  {selectedFile?.name}
                </span>
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/12 px-2.5 py-1 text-xs font-medium text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white"
                >
                  <RotateCcw className="h-3 w-3" />
                  {UI_TEXT.home.visualSearch.changeFile}
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-500/15 bg-red-500/6 px-3.5 py-2.5">
              <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
              <p className="text-xs leading-relaxed text-red-300/90">{error}</p>
            </div>
          )}

          {/* Searching animation */}
          {isSearching && (
            <div className="flex items-center gap-3 rounded-xl border border-[#c6a97e]/15 bg-[#c6a97e]/5 px-4 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-[#c6a97e]/70"
                    style={{
                      animation: `vsPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
              <p className="text-xs text-[#c6a97e]/80">
                {UI_TEXT.home.visualSearch.analyzing}
              </p>
            </div>
          )}

          {/* Soft error from API response */}
          {response && !response.ok && (
            <div className="rounded-xl border border-white/8 bg-white/3 px-3.5 py-2.5 text-xs text-text-sec">
              {response.message ?? UI_TEXT.home.visualSearch.messages.searchFailed}
            </div>
          )}

          {/* Results */}
          {hasResults && response?.ok && (
            <div className="space-y-3">
              {/* Category label */}
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-white/6" />
                <span className="flex items-center gap-1.5 rounded-full border border-[#c6a97e]/20 bg-[#c6a97e]/8 px-3 py-1 text-[11px] font-medium text-[#c6a97e]">
                  <Sparkles className="h-3 w-3" />
                  {UI_TEXT.home.visualSearch.searchingCategory.replace(
                    "{category}",
                    detectedCategoryLabel ?? response.category
                  )}
                </span>
                <div className="h-px flex-1 bg-white/6" />
              </div>

              {/* Master cards */}
              <div className="space-y-2">
                {response.results.map((item) => (
                  <article
                    key={item.provider.id}
                    className="overflow-hidden rounded-2xl border border-white/8 bg-white/3 transition-colors hover:border-white/12 hover:bg-white/5"
                  >
                    {/* Photo strip */}
                    {item.matchingPhotos.length > 0 && (
                      <div className="grid grid-cols-3 gap-0.5">
                        {item.matchingPhotos.slice(0, 3).map((photo) => (
                          <div
                            key={photo.assetId}
                            className="aspect-square overflow-hidden"
                          >
                            <img
                              src={photo.url}
                              alt=""
                              className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Name + rating + CTA */}
                    <div className="flex items-center justify-between gap-3 px-3.5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-text-main">
                          {item.provider.name}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1">
                          <Star className="h-3 w-3 fill-[#c6a97e] text-[#c6a97e]" />
                          <span className="text-xs text-text-sec">
                            {item.provider.ratingAvg.toFixed(1)}
                          </span>
                        </div>
                      </div>
                      {item.provider.publicUsername ? (
                        <Link
                          href={`/u/${item.provider.publicUsername}`}
                          className="shrink-0 rounded-xl bg-[#c6a97e] px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                        >
                          {UI_TEXT.home.visualSearch.actions.book}
                        </Link>
                      ) : (
                        <span className="shrink-0 text-xs text-text-sec">
                          {UI_TEXT.home.visualSearch.actions.profileUnavailable}
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {/* No results */}
          {noResults && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/8 bg-white/2 py-8 px-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/6">
                <Sparkles className="h-5 w-5 text-text-sec" />
              </div>
              <p className="text-sm font-medium text-text-main">{UI_TEXT.home.visualSearch.noResultsTitle}</p>
              <p className="text-xs text-text-sec">
                {UI_TEXT.home.visualSearch.noResultsSubtitle}
              </p>
            </div>
          )}

          {/* Search button */}
          <button
            type="button"
            disabled={isSearching || !selectedFile}
            onClick={() => void runSearch()}
            className="w-full rounded-2xl bg-[#c6a97e] py-3 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40 hover:opacity-90"
          >
            {isSearching
              ? UI_TEXT.home.visualSearch.analyzing
              : UI_TEXT.home.visualSearch.actions.startSearch}
          </button>

        </div>
      </div>

      <style>{`
        @keyframes vsPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.75); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </ModalSurface>
  );
}
