import { AccountType } from "@prisma/client";

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

export function detectCurrentCabinet(pathname: string): CabinetKind {
  if (pathname.startsWith("/cabinet/master")) return "master";
  if (pathname.startsWith("/cabinet/studio")) return "studio";
  return "user";
}
