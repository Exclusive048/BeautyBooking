import { getMasterPublicProfileView } from "@/lib/master/public-profile-view.service";
import { logPublicBlockError } from "@/features/public-profile/master/server/block-error";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  providerId: string;
};

const T = UI_TEXT.publicProfile.about;

export async function AboutSection({ providerId }: Props) {
  let view = null;
  let hasError = false;

  try {
    view = await getMasterPublicProfileView(providerId);
  } catch (error) {
    hasError = true;
    logPublicBlockError("master-about", error, [`/api/providers/${providerId}`]);
  }

  if (hasError || !view) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-sm text-text-sec">
        {UI_TEXT.publicProfile.page.blockLoadFailed}
      </div>
    );
  }

  const description = view.provider.description?.trim();

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5 md:p-6">
      <h2 className="mb-3 font-display text-lg text-text-main">{T.heading}</h2>
      <p className="whitespace-pre-line text-[15px] leading-relaxed text-text-main">
        {description || (
          <span className="text-text-sec">{T.descriptionFallback}</span>
        )}
      </p>
    </section>
  );
}
