import { describe, expect, it } from "vitest";
import {
  buildMasterSetupGuide,
  buildStudioSetupGuide,
  nextSetupStep,
  setupStepHref,
  type MasterSetupFacts,
  type StudioSetupFacts,
} from "./setup-guide-shared";

/**
 * SETUP-GUIDE-01 — «Первые шаги»: порядок шагов, что считается выполненным,
 * куда ведёт «Дальше».
 *
 * @probe 2026-09-28 — у студии условие шага «Услуги мастерам» ослаблено до
 * `mastersWithoutServices === 0` без `hasMasters`: покраснел «студия без мастеров
 * — назначать и планировать некого» (шаг отмечался выполненным при нуле
 * мастеров). Возвращено — зелёный.
 *
 * @probe 2026-09-29 — в `nextSetupStep` пропуск ждущих шагов заменён прежним
 * `!step.done`: покраснел «пока мастера не приняли приглашение, «Дальше» ведёт
 * мимо услуг мастерам и графика» (получен "assign" вместо "rules"). Возвращено —
 * зелёный.
 */

const MASTER_EMPTY: MasterSetupFacts = {
  profile: false,
  address: false,
  services: false,
  schedule: false,
  rules: false,
  portfolio: false,
  catalog: false,
  hidden: false,
};

const STUDIO_EMPTY: StudioSetupFacts = {
  profile: false,
  address: false,
  services: false,
  activeMasters: 0,
  invitesPending: 0,
  mastersWithoutServices: 0,
  mastersWithoutSchedule: 0,
  rules: false,
  portfolio: false,
  catalog: false,
  hidden: false,
};

describe("первые шаги мастера", () => {
  it("путь до каталога: профиль → адрес → услуги → график → правила → портфолио → каталог", () => {
    const guide = buildMasterSetupGuide(MASTER_EMPTY);
    expect(guide.steps.map((step) => step.id)).toEqual([
      "profile",
      "address",
      "services",
      "schedule",
      "rules",
      "portfolio",
      "catalog",
    ]);
    expect(guide).toMatchObject({ doneCount: 0, total: 7, nextId: "profile" });
  });

  it("следующий шаг — первый невыполненный; всё готово — null", () => {
    const partly = buildMasterSetupGuide({ ...MASTER_EMPTY, profile: true, address: true, services: true });
    expect(partly.nextId).toBe("schedule");
    expect(partly.doneCount).toBe(3);
    const done = buildMasterSetupGuide({
      ...MASTER_EMPTY,
      profile: true,
      address: true,
      services: true,
      schedule: true,
      rules: true,
      portfolio: true,
      catalog: true,
    });
    expect(done.nextId).toBeNull();
  });

  it("экран шага несёт ?guide= перед якорем", () => {
    expect(setupStepHref("master", "profile")).toBe("/cabinet/master/profile?guide=profile#profile-header");
    expect(setupStepHref("master", "rules")).toBe("/cabinet/master/schedule/settings?tab=rules&guide=rules");
    expect(setupStepHref("studio", "masters")).toBe("/cabinet/studio/team?guide=masters");
  });
});

describe("первые шаги студии", () => {
  it("плюс мастера и услуги мастерам", () => {
    expect(buildStudioSetupGuide(STUDIO_EMPTY).steps.map((step) => step.id)).toEqual([
      "profile",
      "address",
      "services",
      "masters",
      "assign",
      "schedule",
      "rules",
      "portfolio",
      "catalog",
    ]);
  });

  it("студия без мастеров — назначать и планировать некого", () => {
    const guide = buildStudioSetupGuide({ ...STUDIO_EMPTY, invitesPending: 2 });
    const done = Object.fromEntries(guide.steps.map((step) => [step.id, step.done]));
    expect(done).toMatchObject({ masters: false, assign: false, schedule: false });
    expect(guide.invitesPending).toBe(2);
  });

  it("пока мастера не приняли приглашение, «Дальше» ведёт мимо услуг мастерам и графика", () => {
    const guide = buildStudioSetupGuide({ ...STUDIO_EMPTY, profile: true, address: true, services: true, invitesPending: 1 });
    const blocked = guide.steps.filter((step) => step.blocked).map((step) => step.id);
    expect(blocked).toEqual(["assign", "schedule"]);
    expect(guide.nextId).toBe("masters");
    expect(nextSetupStep(guide, "masters")?.id).toBe("rules");
    // Всё, что можно, сделано — остаётся ждать мастера.
    const waiting = buildStudioSetupGuide({
      ...STUDIO_EMPTY,
      profile: true,
      address: true,
      services: true,
      rules: true,
      portfolio: true,
      catalog: true,
    });
    expect(nextSetupStep(waiting, "portfolio")?.id).toBe("masters");
    // Мастер принял — шаги открываются.
    const joined = buildStudioSetupGuide({ ...STUDIO_EMPTY, activeMasters: 1, mastersWithoutServices: 1, mastersWithoutSchedule: 1 });
    expect(joined.steps.filter((step) => step.blocked)).toEqual([]);
    expect(nextSetupStep(joined, "masters")?.id).toBe("assign");
  });

  it("услуги и график — у каждого активного мастера", () => {
    const partly = buildStudioSetupGuide({
      ...STUDIO_EMPTY,
      activeMasters: 3,
      mastersWithoutServices: 1,
      mastersWithoutSchedule: 0,
    });
    const done = Object.fromEntries(partly.steps.map((step) => [step.id, step.done]));
    expect(done).toMatchObject({ masters: true, assign: false, schedule: true });
    expect(partly.invitesPending).toBe(0);
  });
});

describe("«Дальше» из подсказки", () => {
  it("следующий невыполненный после текущего, иначе первый невыполненный", () => {
    const guide = buildMasterSetupGuide({ ...MASTER_EMPTY, address: true, services: true });
    expect(nextSetupStep(guide, "profile")?.id).toBe("schedule");
    const tail = buildMasterSetupGuide({ ...MASTER_EMPTY, schedule: true, rules: true, portfolio: true, catalog: true });
    // После каталога — назад к первому невыполненному.
    expect(nextSetupStep(tail, "catalog")?.id).toBe("profile");
    // Сам текущий шаг не предлагается снова.
    const onlyOne = buildMasterSetupGuide({
      ...MASTER_EMPTY,
      address: true,
      services: true,
      schedule: true,
      rules: true,
      portfolio: true,
      catalog: true,
    });
    expect(nextSetupStep(onlyOne, "profile")).toBeNull();
  });
});
