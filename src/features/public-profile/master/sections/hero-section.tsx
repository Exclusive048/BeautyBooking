import { HeroBlock } from "@/features/public-profile/master/hero-block";
import { logPublicBlockError } from "@/features/public-profile/master/server/block-error";
import { getMasterPublicProfileView } from "@/lib/master/public-profile-view.service";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  providerId: string;
};

export async function HeroSection({ providerId }: Props) {
  let view = null;
  let hasError = false;

  try {
    view = await getMasterPublicProfileView(providerId);
  } catch (error) {
    hasError = true;
    logPublicBlockError("master-hero", error, [`/api/providers/${providerId}`]);
  }

  if (hasError) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-sm text-text-sec">
        {UI_TEXT.publicProfile.page.blockLoadFailed}
      </div>
    );
  }
  if (!view) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-sm text-text-sec">
        {UI_TEXT.publicProfile.page.profileLoadFailed}
      </div>
    );
  }

  return (
    <div className="fade-in-up">
      <HeroBlock view={view} />
    </div>
  );
}
