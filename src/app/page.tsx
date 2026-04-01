import type { Metadata } from "next";
import { HomePage as HomeFeedPage } from "@/features/home/components/home-page";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "МастерРядом — запись к мастерам онлайн",
  description:
    "Найди мастера маникюра, массажа или стрижки рядом. Онлайн-запись.",
};

export default async function HomePage() {
  const user = await getSessionUser();
  return (
    <HomeFeedPage
      isAuthenticated={!!user}
      userName={user?.displayName ?? null}
    />
  );
}
