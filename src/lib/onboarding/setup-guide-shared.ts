/**
 * SETUP-GUIDE-01 (2026-09-28) — «Первые шаги» кабинета: путь от пустого
 * кабинета до записи клиентов (решение владельца: шаги, которые заполняют
 * профиль, выводят его в каталог и полностью настраивают расписание и услуги;
 * у студии ещё — назначить услуги мастерам).
 *
 * Шаг отмечается сам, когда появились данные (кроме «Правил записи»: у них есть
 * значения по умолчанию, и их просмотр подтверждают явно). Карточка на главной
 * ведёт по шагам, подсказка на экране шага (`?guide=<шаг>`) показывает, что
 * нажать, и переводит к следующему.
 *
 * Client-safe: чистые функции и типы, без запросов.
 */

export type SetupGuideScope = "master" | "studio";

export type SetupStepId =
  | "profile"
  | "address"
  | "services"
  | "masters"
  | "assign"
  | "schedule"
  | "rules"
  | "portfolio"
  | "catalog";

export type SetupStepDto = {
  id: SetupStepId;
  done: boolean;
  /**
   * Шаг пока сделать нельзя — он ждёт другого (студия: услуги мастерам и
   * график команды — первого принятого мастера). Следующим его не предлагают.
   */
  blocked: boolean;
  /** Экран шага с подсказкой (`?guide=<шаг>`). */
  href: string;
};

export type SetupGuideDto = {
  scope: SetupGuideScope;
  steps: SetupStepDto[];
  doneCount: number;
  total: number;
  /** Первый невыполненный шаг, который можно сделать сейчас; `null` — всё готово. */
  nextId: SetupStepId | null;
  /** Карточку на главной скрыли. */
  hidden: boolean;
  /** Студия: приглашения ждут ответа, а активных мастеров ещё нет. */
  invitesPending: number;
};

export type MasterSetupFacts = {
  profile: boolean;
  address: boolean;
  services: boolean;
  schedule: boolean;
  rules: boolean;
  portfolio: boolean;
  catalog: boolean;
  hidden: boolean;
};

export type StudioSetupFacts = {
  profile: boolean;
  address: boolean;
  services: boolean;
  /** Активных мастеров в студии. */
  activeMasters: number;
  invitesPending: number;
  /** Активных мастеров без назначенных услуг студии. */
  mastersWithoutServices: number;
  /** Активных мастеров без расписания. */
  mastersWithoutSchedule: number;
  rules: boolean;
  portfolio: boolean;
  catalog: boolean;
  hidden: boolean;
};

/** Проводник: параметр адреса, по которому экран шага показывает подсказку. */
export const SETUP_GUIDE_PARAM = "guide";

const MASTER_ROUTES: Record<string, string> = {
  profile: "/cabinet/master/profile#profile-header",
  address: "/cabinet/master/profile#profile-location",
  services: "/cabinet/master/services",
  schedule: "/cabinet/master/schedule/settings",
  rules: "/cabinet/master/schedule/settings?tab=rules",
  portfolio: "/cabinet/master/portfolio",
  catalog: "/cabinet/master/schedule/settings?tab=visibility",
};

const STUDIO_ROUTES: Record<string, string> = {
  profile: "/cabinet/studio/settings?section=profile",
  address: "/cabinet/studio/settings?section=profile",
  services: "/cabinet/studio/services",
  masters: "/cabinet/studio/team",
  assign: "/cabinet/studio/services",
  schedule: "/cabinet/studio/schedule/team",
  rules: "/cabinet/studio/settings?section=policy",
  portfolio: "/cabinet/studio/settings?section=portfolio",
  catalog: "/cabinet/studio/settings?section=profile",
};

/** Адрес экрана шага с подсказкой: `?guide=` встаёт перед якорем. */
export function setupStepHref(scope: SetupGuideScope, id: SetupStepId): string {
  const route = (scope === "master" ? MASTER_ROUTES : STUDIO_ROUTES)[id] ?? "/cabinet";
  const [pathAndQuery, hash] = route.split("#");
  const separator = pathAndQuery!.includes("?") ? "&" : "?";
  return `${pathAndQuery}${separator}${SETUP_GUIDE_PARAM}=${id}${hash ? `#${hash}` : ""}`;
}

function assemble(
  scope: SetupGuideScope,
  entries: Array<[SetupStepId, boolean, boolean?]>,
  extra: { hidden: boolean; invitesPending: number },
): SetupGuideDto {
  const steps = entries.map(([id, done, blocked = false]) => ({
    id,
    done,
    blocked: !done && blocked,
    href: setupStepHref(scope, id),
  }));
  const doneCount = steps.filter((step) => step.done).length;
  return {
    scope,
    steps,
    doneCount,
    total: steps.length,
    nextId: steps.find(isOpenStep)?.id ?? null,
    hidden: extra.hidden,
    invitesPending: extra.invitesPending,
  };
}

export function buildMasterSetupGuide(facts: MasterSetupFacts): SetupGuideDto {
  return assemble(
    "master",
    [
      ["profile", facts.profile],
      ["address", facts.address],
      ["services", facts.services],
      ["schedule", facts.schedule],
      ["rules", facts.rules],
      ["portfolio", facts.portfolio],
      ["catalog", facts.catalog],
    ],
    { hidden: facts.hidden, invitesPending: 0 },
  );
}

/**
 * Студия. «Услуги мастерам» и «График команды» — у КАЖДОГО активного мастера
 * (без мастеров шаг не выполнен: назначать и планировать некого).
 */
export function buildStudioSetupGuide(facts: StudioSetupFacts): SetupGuideDto {
  const hasMasters = facts.activeMasters > 0;
  return assemble(
    "studio",
    [
      ["profile", facts.profile],
      ["address", facts.address],
      ["services", facts.services],
      ["masters", hasMasters],
      ["assign", hasMasters && facts.mastersWithoutServices === 0, !hasMasters],
      ["schedule", hasMasters && facts.mastersWithoutSchedule === 0, !hasMasters],
      ["rules", facts.rules],
      ["portfolio", facts.portfolio],
      ["catalog", facts.catalog],
    ],
    { hidden: facts.hidden, invitesPending: hasMasters ? 0 : facts.invitesPending },
  );
}

/** Шаг не сделан и его можно сделать сейчас. */
function isOpenStep(step: SetupStepDto): boolean {
  return !step.done && !step.blocked;
}

/**
 * Куда вести после шага `afterId`: следующий невыполненный по порядку, иначе
 * первый невыполненный вообще; шаги, которые ждут другого, пропускаются;
 * `null` — сейчас делать больше нечего.
 */
export function nextSetupStep(guide: SetupGuideDto, afterId: SetupStepId | null): SetupStepDto | null {
  const index = afterId ? guide.steps.findIndex((step) => step.id === afterId) : -1;
  const after = guide.steps.slice(index + 1).find(isOpenStep);
  if (after) return after;
  return guide.steps.find((step) => isOpenStep(step) && step.id !== afterId) ?? null;
}
