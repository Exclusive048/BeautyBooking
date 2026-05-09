import type { ProfileCompletion } from "@/lib/master/profile-completion";
import { CompletionCard } from "./completion-card";
import { SectionNav } from "./section-nav";
import { TipCard } from "./tip-card";

type Props = {
  completion: ProfileCompletion;
};

/** Composition of the left sidebar — just glue, all rendering lives in
 * the three children so each can be tweaked independently. */
export function ProfileSidebar({ completion }: Props) {
  return (
    <div className="space-y-4">
      <CompletionCard percent={completion.percent} />
      <SectionNav bySection={completion.bySection} />
      <TipCard />
    </div>
  );
}
