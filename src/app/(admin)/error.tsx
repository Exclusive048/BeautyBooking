"use client";

import { useErrorBoundaryReport } from "@/hooks/use-error-boundary-report";
import { ErrorState } from "@/components/ui/error-state";
import { UI_TEXT } from "@/lib/ui/text";

const t = UI_TEXT.pages.error;

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useErrorBoundaryReport(error);

  return (
    <ErrorState
      variant="warning"
      title={t.admin.title}
      description={`${t.admin.subtitle}${error.digest ? ` (digest: ${error.digest})` : ""}`}
      primaryAction={{ label: t.retry, onClick: reset }}
      secondaryAction={{ label: t.goBack, href: "/admin" }}
    />
  );
}
