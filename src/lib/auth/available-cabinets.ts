import { AccountType } from "@/lib/prisma-enums";

export type CabinetKind = "user" | "master" | "studio";

export const CABINET_URLS: Record<CabinetKind, string> = {
  user: "/cabinet",
  master: "/cabinet/master/dashboard",
  studio: "/cabinet/studio",
};

export function getAvailableCabinets(roles: AccountType[]): CabinetKind[] {
  const cabinets: CabinetKind[] = ["user"];
  if (roles.includes(AccountType.MASTER)) cabinets.push("master");
  if (
    roles.includes(AccountType.STUDIO) ||
    roles.includes(AccountType.STUDIO_ADMIN)
  ) {
    cabinets.push("studio");
  }
  return cabinets;
}

/**
 * Есть ли у пользователя хотя бы один ПРОФЕССИОНАЛЬНЫЙ кабинет (мастер/студия).
 *
 * Заведён отдельным предикатом, потому что от него зависит подпись одного и того
 * же пункта меню на двух поверхностях (`AuthUserMenu` и `AuthMobileMenu`): без
 * кабинета пункт ведёт в создание и называется «Стать мастером», с кабинетом —
 * «Мои кабинеты». Две копии условия разъехались бы так же, как разъезжались
 * копии права на приглашение (см. `lib/invites/access.ts`).
 *
 * Источник — РОЛИ (через `getAvailableCabinets`), а не наличие строки
 * `Provider`: роль и есть то, что открывает кабинет, и именно на ней построено
 * меню «Сменить кабинет» (`getAvailableCabinets`).
 */
export function hasProfessionalCabinet(cabinets: readonly CabinetKind[]): boolean {
  return cabinets.some((cabinet) => cabinet !== "user");
}

/** Куда ведёт «Стать мастером» у вошедшего: карточки создания кабинета мастера/студии. */
export const BECOME_MASTER_HREF = "/cabinet/roles";

/**
 * NAV-BECOME-MASTER-01 — показывать ли вошедшему пользователю «Стать мастером»
 * как отдельную кнопку (шапка на десктопе, нижняя навигация и бургер в PWA).
 *
 * Кнопка живёт ровно до появления первого профессионального кабинета: на её
 * месте потом встают ярлыки кабинетов (десктоп) и переключатель кабинетов
 * (нижняя навигация). Источник — РОЛИ, тот же, что у `hasProfessionalCabinet`,
 * иначе кнопка и подпись пункта меню разъехались бы. Администраторы платформы
 * клиентами не являются — им кнопка не предлагается.
 *
 * Принимает `string[]`, а не `AccountType[]`: клиентские потребители получают
 * роли из `/api/me` (`MeIdentity.roles: string[]`).
 */
export function shouldOfferBecomeMaster(roles: readonly string[]): boolean {
  if (roles.includes(AccountType.ADMIN) || roles.includes(AccountType.SUPERADMIN)) return false;
  return !hasProfessionalCabinet(getAvailableCabinets(roles as AccountType[]));
}

export function detectCurrentCabinet(pathname: string): CabinetKind {
  if (pathname.startsWith("/cabinet/master")) return "master";
  if (pathname.startsWith("/cabinet/studio")) return "studio";
  return "user";
}
