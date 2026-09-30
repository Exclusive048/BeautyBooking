import type { SetupGuideScope, SetupStepId } from "@/lib/onboarding/setup-guide-shared";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.setupGuide;

export type SetupStepText = { title: string; body: string; hint: string };

/** Тексты шага «Первых шагов» — у мастера и студии свои. */
export function setupStepText(scope: SetupGuideScope, id: SetupStepId): SetupStepText {
  const steps = T.steps[scope] as Partial<Record<SetupStepId, SetupStepText>>;
  return steps[id] ?? { title: "", body: "", hint: "" };
}

/** Главная кабинета — куда ведёт «Готово» в конце пути. */
export function setupGuideHomeHref(scope: SetupGuideScope): string {
  return scope === "master" ? "/cabinet/master/dashboard" : "/cabinet/studio";
}
