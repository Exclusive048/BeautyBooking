import type { Metadata } from "next";
import { HomePage as HomeFeedPage } from "@/features/home/components/home-page";

export const metadata: Metadata = {
  title: "МастерРядом — запись к мастерам онлайн",
  description:
    "Найди мастера маникюра, массажа или стрижки рядом. Онлайн-запись.",
};

export default function HomePage() {
  return <HomeFeedPage />;
}
