"use client";

import { AvatarEditor } from "@/features/media/components/avatar-editor";
import { UI_TEXT } from "@/lib/ui/text";

export function SiteLogoManager() {
  return (
    <div className="space-y-3 rounded-2xl border p-5">
      <div>
        <h3 className="text-lg font-semibold">{UI_TEXT.admin.media.siteLogoTitle}</h3>
        <p className="text-sm text-neutral-600">{UI_TEXT.admin.media.siteLogoDescription}</p>
      </div>
      <AvatarEditor entityType="SITE" entityId="site" sizeClassName="h-16 w-16" />
    </div>
  );
}

