"use client";

import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

export default function OfflinePage() {
  return (
    <div className="min-h-[100dvh] bg-bg-page px-6 py-10 pt-safe pb-safe flex flex-col items-center justify-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-card shadow-card">
        <WifiOff className="h-8 w-8 text-text-sec" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold text-text-main">{UI_TEXT.pages.offline.title}</h1>
      <p className="mt-2 max-w-sm text-sm text-text-sec">
        {UI_TEXT.pages.offline.subtitle}
      </p>
      <div className="mt-6 flex w-full max-w-sm flex-col gap-3">
        <Button
          type="button"
          onClick={() => window.location.reload()}
          className="w-full"
        >
          {UI_TEXT.pages.offline.reload}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => window.history.back()}
          className="w-full"
        >
          {UI_TEXT.pages.offline.back}
        </Button>
      </div>
    </div>
  );
}
