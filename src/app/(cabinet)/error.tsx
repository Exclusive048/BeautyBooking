"use client";

import { useErrorBoundaryReport } from "@/hooks/use-error-boundary-report";
import { ErrorState } from "@/components/ui/error-state";
import * as UI_TEXT from "@/lib/ui/text";

const t = UI_TEXT.errorPages.error;

export default function CabinetError({
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
      title={t.cabinet.title}
      description={t.cabinet.subtitle}
      primaryAction={{ label: t.retry, onClick: reset }}
      secondaryAction={{ label: t.goBack, href: "/cabinet" }}
    />
  );
}
