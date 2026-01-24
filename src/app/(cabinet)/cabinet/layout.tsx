import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export default async function CabinetLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <>{children}</>;
}
