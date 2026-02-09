import type { ReactNode } from "react";
import { CabinetLayout } from "@/features/cabinet/layout/cabinet-layout";
import { getSessionUser } from "@/lib/auth/session";

type Props = {
  children: ReactNode;
};

export default async function UserCabinetLayout({ children }: Props) {
  const user = await getSessionUser();
  const userLabel =
    user?.displayName?.trim() ||
    user?.firstName?.trim() ||
    user?.phone?.trim() ||
    "BeautyHub";

  return <CabinetLayout userLabel={userLabel}>{children}</CabinetLayout>;
}
