"use client";

import { useErrorBoundaryReport } from "@/hooks/use-error-boundary-report";
import { ErrorState } from "@/components/ui/error-state";
import * as UI_TEXT from "@/lib/ui/text";

const t = UI_TEXT.errorPages.error;

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useErrorBoundaryReport(error);

  return (
    <ErrorState
      variant="default"
      title={t.public.title}
      description={t.public.subtitle}
      primaryAction={{ label: t.retry, onClick: reset }}
      secondaryAction={{ label: t.goHome, href: "/" }}
    />
  );
}
