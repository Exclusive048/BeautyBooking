"use client";

import { AvatarEditor } from "@/features/media/components/avatar-editor";

export function SiteLogoManager() {
  return (
    <div className="rounded-2xl border p-5 space-y-3">
      <div>
        <h3 className="text-lg font-semibold">Логотип сайта</h3>
        <p className="text-sm text-neutral-600">Используется в navbar рядом с BeautyHub.</p>
      </div>
      <AvatarEditor entityType="SITE" entityId="site" sizeClassName="h-16 w-16" />
    </div>
  );
}
