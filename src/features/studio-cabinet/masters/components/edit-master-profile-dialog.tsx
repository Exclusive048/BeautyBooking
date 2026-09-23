"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AvatarEditor } from "@/features/media/components/avatar-editor";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioMasterDetail } from "../server/types";

const T = UI_TEXT.studioCabinet.mastersV2.editProfileDialog;

type Props = {
  studioId: string;
  detail: StudioMasterDetail;
  open: boolean;
  onClose: () => void;
};

/**
 * STUDIO-EDIT-MASTER-PROFILE-01 — руководитель студии правит профиль мастера
 * своей команды: публичное имя, специализацию, описание и фото (запрос
 * тестировщика-руководителя студии). Текстовые поля уходят одним
 * `PATCH /api/studio/masters/[id]`, фото — сразу, тем же `AvatarEditor`, что у
 * мастера в кабинете: доступ к медиа мастера администратор его студии уже
 * имеет (`media/access.ts`), поэтому отдельного пути загрузки нет.
 *
 * ⚠️ Это та же строка `Provider`, что у мастера в его кабинете: правка студии
 * видна на личной странице мастера так же, как на странице студии.
 */
export function EditMasterProfileDialog({ studioId, detail, open, onClose }: Props) {
  const router = useRouter();
  const [name, setName] = useState(detail.profile.name);
  const [tagline, setTagline] = useState(detail.profile.tagline);
  const [description, setDescription] = useState(detail.profile.description);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setError(null);
    onClose();
    // Фото сохраняется сразу при загрузке — шапка карточки должна его показать.
    router.refresh();
  }

  async function handleSubmit() {
    const trimmedName = name.trim();
    const trimmedTagline = tagline.trim();
    if (!trimmedName) {
      setError(T.nameRequired);
      return;
    }
    if (!trimmedTagline) {
      setError(T.taglineRequired);
      return;
    }
    setError(null);
    try {
      const response = await fetch(`/api/studio/masters/${encodeURIComponent(detail.providerId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studioId,
          displayName: trimmedName,
          tagline: trimmedTagline,
          description: description.trim(),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? T.saveFailed);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError(T.saveFailed);
    }
  }

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title={T.title}
      submitLabel={T.submit}
      cancelLabel={T.cancel}
      onSubmit={handleSubmit}
      error={error}
    >
      <p className="text-sm text-text-sec">{T.subtitle}</p>
      <div>
        <span className="mb-1 block text-xs font-medium text-text-main">{T.photoLabel}</span>
        <AvatarEditor entityType="MASTER" entityId={detail.providerId} sizeClassName="h-20 w-20" />
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-text-main">{T.nameLabel}</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-text-main">{T.taglineLabel}</span>
        <Input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder={T.taglinePlaceholder}
          maxLength={240}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-text-main">{T.descriptionLabel}</span>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={T.descriptionPlaceholder}
          rows={4}
          maxLength={2000}
        />
      </label>
    </FormDialog>
  );
}
