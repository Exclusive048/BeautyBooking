import { describe, expect, it, vi } from "vitest";
import { buildMasterSetupGuide, type MasterSetupFacts } from "@/lib/onboarding/setup-guide-shared";

/**
 * Решение владельца 2026-10-14: приглашение в студию принимается только с
 * кабинетом мастера, где пройдены ВСЕ «Первые шаги». Готовность и следующий
 * шаг выводятся из той же карточки «Первые шаги», что на главной кабинета, —
 * своей копии шагов здесь нет.
 *
 * @probe 2026-10-14 — `ready` = «пройден хоть один шаг» (`doneCount > 0`):
 * краснеют «не хватает одного шага» и «скрытая карточка шаги не засчитывает».
 */

const guide = vi.hoisted(() => ({ loadMasterSetupGuide: vi.fn() }));
vi.mock("@/lib/onboarding/setup-guide", () => guide);

import { resolveMasterInviteReadiness } from "@/lib/invites/master-readiness";

const ALL_DONE: MasterSetupFacts = {
  profile: true,
  address: true,
  services: true,
  schedule: true,
  rules: true,
  portfolio: true,
  catalog: true,
  hidden: false,
};

describe("resolveMasterInviteReadiness", () => {
  it("кабинета мастера нет — не готов, ведёт создавать кабинет; шагов столько же, сколько в карточке", async () => {
    guide.loadMasterSetupGuide.mockResolvedValueOnce(null);
    const readiness = await resolveMasterInviteReadiness("u1");
    expect(readiness).toEqual({
      hasCabinet: false,
      ready: false,
      doneCount: 0,
      total: buildMasterSetupGuide(ALL_DONE).total,
      href: "/cabinet/roles",
    });
  });

  it("не хватает одного шага — не готов, ведёт на экран этого шага", async () => {
    guide.loadMasterSetupGuide.mockResolvedValueOnce(buildMasterSetupGuide({ ...ALL_DONE, portfolio: false }));
    const readiness = await resolveMasterInviteReadiness("u1");
    expect(readiness.ready).toBe(false);
    expect(readiness.doneCount).toBe(readiness.total - 1);
    expect(readiness.href).toBe("/cabinet/master/portfolio?guide=portfolio");
  });

  it("скрытая карточка «Первые шаги» шаги не засчитывает", async () => {
    guide.loadMasterSetupGuide.mockResolvedValueOnce(
      buildMasterSetupGuide({ ...ALL_DONE, catalog: false, hidden: true }),
    );
    expect((await resolveMasterInviteReadiness("u1")).ready).toBe(false);
  });

  it("все шаги пройдены — готов", async () => {
    guide.loadMasterSetupGuide.mockResolvedValueOnce(buildMasterSetupGuide(ALL_DONE));
    const readiness = await resolveMasterInviteReadiness("u1");
    expect(readiness.ready).toBe(true);
    expect(readiness.doneCount).toBe(readiness.total);
  });
});
