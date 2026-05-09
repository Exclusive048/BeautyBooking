import { MasterProfilePage } from "@/features/master/components/profile/master-profile-page";

/**
 * `/cabinet/master/profile` — redesigned (31a). The legacy 3224-line
 * client component (and its dynamic-import wrapper) was removed in this
 * commit; portfolio + services management now live behind dedicated
 * routes (31b backlog).
 */
export default async function MasterProfileRoute() {
  return <MasterProfilePage />;
}
