"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global] Unhandled error:", error);
  }, [error]);

  return (
    <html lang="ru">
      <body className="flex min-h-screen items-center justify-center bg-bg-page px-4">
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-2xl font-semibold text-text-main">
            {UI_TEXT.pages.globalError.title}
          </h1>
          <p className="mt-2 text-text-sec">
            {UI_TEXT.pages.globalError.subtitle}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button onClick={reset}>
              {UI_TEXT.pages.globalError.retry}
            </Button>
            <Button variant="secondary" asChild>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/">{UI_TEXT.pages.globalError.goHome}</a>
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
