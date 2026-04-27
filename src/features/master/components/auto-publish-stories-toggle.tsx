"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { fetchWithAuth } from "@/lib/http/fetch-with-auth";
import { UI_TEXT } from "@/lib/ui/text";

type Status = "idle" | "saving" | "saved" | "error";

const SAVED_AUTO_HIDE_MS = 1800;
const ERROR_AUTO_HIDE_MS = 5000;

type Props = {
  initialEnabled: boolean;
};

export function AutoPublishStoriesToggle({ initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [status, setStatus] = useState<Status>("idle");
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const T = UI_TEXT.master.profile.autoPublishStories;

  const scheduleHide = (ms: number) => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setStatus("idle"), ms);
  };

  const apply = async (next: boolean): Promise<void> => {
    const previous = enabled;
    setEnabled(next);
    setStatus("saving");
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    try {
      const res = await fetchWithAuth("/api/master/settings/auto-publish-stories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error("save_failed");
      setStatus("saved");
      scheduleHide(SAVED_AUTO_HIDE_MS);
    } catch {
      setEnabled(previous);
      setStatus("error");
      scheduleHide(ERROR_AUTO_HIDE_MS);
    }
  };

  const handleToggle = (next: boolean) => { void apply(next); };
  const handleRetry = () => { void apply(enabled); };

  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-main">{T.title}</p>
        <p className="mt-1 text-xs text-text-sec sm:text-sm">{T.description}</p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {/* Status indicator — reserved space, fades opacity to avoid layout-jump */}
        <span
          aria-live="polite"
          className={`inline-flex min-h-[1.25rem] min-w-[8rem] items-center justify-end gap-1.5 text-xs font-medium transition-opacity duration-200 ${
            status === "idle" ? "opacity-0" : "opacity-100"
          }`}
        >
          {status === "saving" ? (
            <span className="inline-flex items-center gap-1.5 text-text-sec">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {T.saving}
            </span>
          ) : null}
          {status === "saved" ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" aria-hidden />
              {T.saved}
            </span>
          ) : null}
          {status === "error" ? (
            <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden />
              {T.error}
              <button
                type="button"
                onClick={handleRetry}
                className="font-medium underline transition-colors hover:no-underline"
              >
                {T.retry}
              </button>
            </span>
          ) : null}
        </span>

        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={status === "saving"}
          aria-label={T.ariaLabel}
        />
      </div>
    </div>
  );
}
