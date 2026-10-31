import type { ProfileCompletion } from "@/lib/master/profile-completion";
import { CompletionCard } from "./completion-card";
import { SectionNav } from "./section-nav";

type Props = {
  completion: ProfileCompletion;
};

/** Composition of the left sidebar — just glue, all rendering lives in
 * the children so each can be tweaked independently. */
export function ProfileSidebar({ completion }: Props) {
  return (
    <div className="space-y-3 lg:space-y-4">
      <CompletionCard percent={completion.percent} />
      <SectionNav bySection={completion.bySection} />
    </div>
  );
}
