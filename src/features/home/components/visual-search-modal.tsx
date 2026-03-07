/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
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
  const [isSearching, setIsSearching] = useState(false);
  const [response, setResponse] = useState<VisualSearchHttpResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setIsDragging(false);
    setSelectedFile(null);
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
      return;
    }
    setSelectedFile(file);
    setResponse(null);
    setError(null);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null;
    selectFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    selectFile(file);
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
    response && response.ok ? VISUAL_CATEGORY_LABELS[response.category] : null;

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      title={UI_TEXT.home.visualSearch.modalTitle}
      className="max-w-4xl"
    >
      <div className="space-y-4">
        <div
          className={`rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-border-subtle bg-bg-input/40"
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <div className="text-sm font-medium text-text-main">
            {UI_TEXT.home.visualSearch.dropzoneTitle}
          </div>
          <div className="mt-1 text-xs text-text-sec">
            {UI_TEXT.home.visualSearch.dropzoneSubtitle}
          </div>
          <div className="mt-3">
            <button
              type="button"
              className="rounded-xl border border-border-subtle px-3 py-2 text-sm text-text-main transition-colors hover:bg-bg-input"
              onClick={() => inputRef.current?.click()}
            >
              {UI_TEXT.home.visualSearch.chooseFile}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleInputChange}
            />
          </div>
          <div className="mt-2 text-xs text-text-sec">
            {UI_TEXT.home.visualSearch.fileRequirements}
          </div>
          {selectedFile ? (
            <div className="mt-2 text-xs text-text-main">
              {UI_TEXT.home.visualSearch.selectedFile.replace("{name}", selectedFile.name)}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSearching}
            onClick={() => void runSearch()}
          >
            {UI_TEXT.home.visualSearch.actions.startSearch}
          </button>
          <button
            type="button"
            className="rounded-xl border border-border-subtle px-4 py-2 text-sm text-text-main transition-colors hover:bg-bg-input"
            onClick={() => {
              setSelectedFile(null);
              setResponse(null);
              setError(null);
            }}
          >
            {UI_TEXT.home.visualSearch.actions.searchAgain}
          </button>
        </div>

        {isSearching ? (
          <div className="rounded-2xl border border-border-subtle bg-bg-input/50 p-3 text-sm text-text-main">
            {UI_TEXT.home.visualSearch.analyzing}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {response && !response.ok ? (
          <div className="rounded-2xl border border-border-subtle bg-bg-input/40 p-3 text-sm text-text-main">
            {response.message ?? UI_TEXT.home.visualSearch.messages.searchFailed}
          </div>
        ) : null}

        {response && response.ok ? (
          <div className="space-y-3">
            <div className="text-sm font-medium text-text-main">
              {UI_TEXT.home.visualSearch.searchingCategory.replace(
                "{category}",
                detectedCategoryLabel ?? response.category
              )}
            </div>
            <div className="text-xs uppercase tracking-wide text-text-sec">
              {UI_TEXT.home.visualSearch.resultsTitle}
            </div>
            <div className="space-y-3">
              {response.results.map((item) => (
                <article
                  key={item.provider.id}
                  className="rounded-2xl border border-border-subtle bg-bg-input/30 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-text-main">{item.provider.name}</div>
                      <div className="text-xs text-text-sec">★ {item.provider.ratingAvg.toFixed(1)}</div>
                    </div>
                    {item.provider.publicUsername ? (
                      <Link
                        href={`/u/${item.provider.publicUsername}`}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        {UI_TEXT.home.visualSearch.actions.book}
                      </Link>
                    ) : (
                      <span className="text-xs text-text-sec">
                        {UI_TEXT.home.visualSearch.actions.profileUnavailable}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {item.matchingPhotos.map((photo) => (
                      <div key={photo.assetId} className="overflow-hidden rounded-lg border border-border-subtle">
                        <img
                          src={photo.url}
                          alt=""
                          className="h-20 w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </ModalSurface>
  );
}
