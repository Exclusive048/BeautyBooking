import { Sparkles } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";
import { UI_TEXT } from "@/lib/ui/text";

const t = UI_TEXT.pages.notFound.modelOffer;

export default function ModelOfferNotFound() {
  return (
    <ErrorState
      icon={Sparkles}
      variant="default"
      title={t.title}
      description={t.subtitle}
      primaryAction={{ label: t.goOffers, href: "/models" }}
      secondaryAction={{ label: UI_TEXT.pages.notFound.goHome, href: "/" }}
    />
  );
}
