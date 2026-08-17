import { ErrorState } from "@/components/ui/error-state";
import { UI_TEXT } from "@/lib/ui/text";

const t = UI_TEXT.pages.forbidden;

export default function ForbiddenPage() {
  return (
    <ErrorState
      icon="lock"
      variant="warning"
      title={t.title}
      description={t.subtitle}
      primaryAction={{ label: t.goHome, href: "/" }}
      secondaryAction={{ label: t.login, href: "/login" }}
    />
  );
}
