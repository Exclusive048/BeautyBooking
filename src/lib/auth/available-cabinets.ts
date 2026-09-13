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

export function detectCurrentCabinet(pathname: string): CabinetKind {
  if (pathname.startsWith("/cabinet/master")) return "master";
  if (pathname.startsWith("/cabinet/studio")) return "studio";
  return "user";
}
