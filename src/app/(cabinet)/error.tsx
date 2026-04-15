"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";
import { UI_TEXT } from "@/lib/ui/text";

const t = UI_TEXT.pages.error;

export default function CabinetError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        digest: error.digest,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <ErrorState
      variant="default"
      title={t.cabinet.title}
      description={t.cabinet.subtitle}
      primaryAction={{ label: t.retry, onClick: reset }}
      secondaryAction={{ label: t.goBack, href: "/cabinet" }}
    />
  );
}
