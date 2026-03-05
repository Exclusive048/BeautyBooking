import type { ReactNode } from "react";
import { CabinetLayout } from "@/features/cabinet/layout/cabinet-layout";
import { getSessionUser } from "@/lib/auth/session";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  children: ReactNode;
};

export default async function UserCabinetLayout({ children }: Props) {
  const user = await getSessionUser();
  const userLabel =
    user?.displayName?.trim() ||
    user?.firstName?.trim() ||
    user?.phone?.trim() ||
    UI_TEXT.brand.name;

  return <CabinetLayout userLabel={userLabel}>{children}</CabinetLayout>;
}

