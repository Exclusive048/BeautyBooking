import { HeroBlock } from "@/features/public-profile/master/hero-block";
import { logPublicBlockError } from "@/features/public-profile/master/server/block-error";
import { getSessionUser } from "@/lib/auth/session";
import { getFavoriteProviderIds } from "@/lib/favorites/get-favorites";
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

  // Favorite toggle on the hero uses the same /api/favorites/toggle endpoint
  // as the catalog. We hydrate `initialFavorited` from the server so the heart
  // renders correctly on first paint instead of flickering after a client
  // fetch.
  const user = await getSessionUser();
  const favoriteIds = user ? await getFavoriteProviderIds(user.id) : null;
  const isFavorited = favoriteIds?.has(view.provider.id) ?? false;

  return (
    <div className="fade-in-up">
      <HeroBlock
        view={view}
        isAuthenticated={!!user}
        initialFavorited={isFavorited}
      />
    </div>
  );
}
