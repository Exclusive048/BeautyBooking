import { redirect } from "next/navigation";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { getSessionUser } from "@/lib/auth/session";
import { getMasterProfileView } from "@/lib/master/profile-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { ProfilePreviewPlaceholder } from "./profile-preview-placeholder";
import { ProfileSidebar } from "./profile-sidebar";
import { AboutSection } from "./sections/about-section";
import { ContactsSection } from "./sections/contacts-section";
import { HeaderSection } from "./sections/header-section";
import { LocationSection } from "./sections/location-section";
import { PortfolioReadonlySection } from "./sections/portfolio-readonly-section";
import { ServicesReadonlySection } from "./sections/services-readonly-section";

const T = UI_TEXT.cabinetMaster;

/**
 * Server orchestrator for `/cabinet/master/profile` (31a).
 *
 * Three-column desktop layout: sticky sidebar (3/12) + main column
 * (6/12) + sticky preview placeholder (3/12). Mobile collapses to a
 * single column and hides the preview — sidebar's section nav still
 * sits above the cards as a vertical mini-menu (sticky doesn't apply).
 */
export async function MasterProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const view = await getMasterProfileView({ userId: user.id });
  if (!view) redirect("/403");

  return (
    <>
      <MasterPageHeader
        breadcrumb={[
          { label: T.pageHeader.breadcrumbHome, href: "/cabinet/master/dashboard" },
          { label: T.profile.breadcrumb },
        ]}
        title={T.profile.title}
        subtitle={T.profile.subtitle}
      />

      <div className="px-4 py-6 md:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <aside className="lg:col-span-3 lg:sticky lg:top-[calc(var(--topbar-h)+1.5rem)] lg:self-start">
            <ProfileSidebar completion={view.completion} />
          </aside>

          <main className="space-y-4 lg:col-span-6">
            <HeaderSection providerId={view.providerId} data={view.header} />
            <ContactsSection data={view.contacts} />
            <AboutSection bio={view.about.bio} />
            <LocationSection data={view.location} />
            <ServicesReadonlySection data={view.services} />
            <PortfolioReadonlySection data={view.portfolio} />
          </main>

          <aside className="hidden lg:col-span-3 lg:block lg:sticky lg:top-[calc(var(--topbar-h)+1.5rem)] lg:self-start">
            <ProfilePreviewPlaceholder />
          </aside>
        </div>
      </div>
    </>
  );
}
