import "server-only";

import { loadMasterSetupGuide } from "@/lib/onboarding/setup-guide";
import { buildMasterSetupGuide } from "@/lib/onboarding/setup-guide-shared";

/**
 * Решение владельца 2026-10-14: принять приглашение в студию можно только с
 * кабинетом мастера, где пройдены ВСЕ «Первые шаги» — профиль, адрес, услуги,
 * расписание, правила записи, портфолио и выход в каталог («это влияет на
 * попадание в каталог, и хочется заполненный профиль»). У кого кабинета
 * мастера нет, сначала его создаёт.
 *
 * Правило одно — для отказа при принятии (`acceptStudioInvite`) и для
 * карточки приглашения (центр уведомлений), где «Принять» до этого выключена,
 * а рядом ссылка на следующий шаг. Шаги и их выполненность — те же, что у
 * карточки «Первые шаги» на главной кабинета (`loadMasterSetupGuide`).
 */
export type MasterInviteReadiness = {
  /** У пользователя есть личный кабинет мастера. */
  hasCabinet: boolean;
  /** Все шаги пройдены — приглашение можно принять. */
  ready: boolean;
  doneCount: number;
  total: number;
  /** Куда идти: экран следующего шага либо создание кабинета мастера. */
  href: string;
};

/** Создание кабинета мастера — страница «Мои кабинеты». */
export const CREATE_MASTER_CABINET_HREF = "/cabinet/roles";

const MASTER_DASHBOARD_HREF = "/cabinet/master/dashboard";

const MASTER_STEP_COUNT = buildMasterSetupGuide({
  profile: false,
  address: false,
  services: false,
  schedule: false,
  rules: false,
  portfolio: false,
  catalog: false,
  hidden: false,
}).total;

export async function resolveMasterInviteReadiness(userId: string): Promise<MasterInviteReadiness> {
  const guide = await loadMasterSetupGuide(userId);
  if (!guide) {
    return {
      hasCabinet: false,
      ready: false,
      doneCount: 0,
      total: MASTER_STEP_COUNT,
      href: CREATE_MASTER_CABINET_HREF,
    };
  }
  const next = guide.steps.find((step) => step.id === guide.nextId) ?? null;
  return {
    hasCabinet: true,
    ready: guide.steps.every((step) => step.done),
    doneCount: guide.doneCount,
    total: guide.total,
    href: next?.href ?? MASTER_DASHBOARD_HREF,
  };
}
