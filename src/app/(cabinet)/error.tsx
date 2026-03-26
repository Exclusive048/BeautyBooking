"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

export default function CabinetError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[cabinet] Unhandled error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-text-main">
        {UI_TEXT.pages.error.cabinet.title}
      </h1>
      <p className="mt-2 text-text-sec">
        {UI_TEXT.pages.error.cabinet.subtitle}
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Button onClick={reset}>
          {UI_TEXT.pages.error.retry}
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/cabinet">{UI_TEXT.pages.error.goBack}</Link>
        </Button>
      </div>
    </div>
  );
}
