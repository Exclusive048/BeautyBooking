"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RoleCardMaster } from "@/features/cabinet/roles/role-card-master";
import { RoleCardStudio } from "@/features/cabinet/roles/role-card-studio";
import { DeleteCabinetModal } from "@/components/deletion/DeleteCabinetModal";
import { ApiClientError, fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

type MasterActiveData = {
  name: string;
  specialization?: string | null;
  ratingAvg?: number | null;
  ratingCount?: number | null;
  isActive?: boolean | null;
  isPublished?: boolean | null;
  statusLabel?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  actionLabel?: string;
  actionHref?: string;
};

type StudioActiveData = {
  name: string;
  logoUrl?: string | null;
  metrics?: string[];
  actionLabel?: string;
  actionHref?: string;
};

type Props = {
  hasMasterProfile: boolean;
  hasStudioProfile: boolean;
  masterData: MasterActiveData | null;
  studioData: StudioActiveData | null;
  createMasterHref: string;
  createStudioHref: string;
};

type DeleteType = "master" | "studio";

export function RolesCards({
  hasMasterProfile,
  hasStudioProfile,
  masterData,
  studioData,
  createMasterHref,
  createStudioHref,
}: Props) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState<DeleteType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeBookingsCount, setActiveBookingsCount] = useState<number | null>(null);

  const deleteLabel = useMemo(
    () => (confirmDelete === "master" ? "master" : confirmDelete === "studio" ? "studio" : null),
    [confirmDelete]
  );

  const closeModal = () => {
    setConfirmDelete(null);
    setError(null);
    setActiveBookingsCount(null);
  };

  const submitDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    setError(null);
    setActiveBookingsCount(null);
    try {
      const endpoint =
        confirmDelete === "master" ? "/api/cabinet/master/delete" : "/api/cabinet/studio/delete";
      await fetchJsonWithAuth<{ deleted: boolean }>(endpoint, { method: "DELETE" });
      closeModal();
      router.refresh();
    } catch (err) {
      // UI-17: без курируемой строки — `deleteFailed`, а не «Ошибка удаления: 500».
      if (err instanceof ApiClientError && err.code === "ACTIVE_BOOKINGS") {
        const details = err.details as { count?: number } | undefined;
        setActiveBookingsCount(typeof details?.count === "number" ? details.count : 0);
      } else {
        setError(serverMessageOr(err, UI_TEXT.cabinetRolesPage.deleteFailed));
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        {hasMasterProfile && masterData ? (
          <RoleCardMaster
            mode="active"
            data={masterData}
            onDelete={() => {
              setConfirmDelete("master");
              setError(null);
              setActiveBookingsCount(null);
            }}
          />
        ) : (
          <RoleCardMaster
            mode="empty"
            actionLabel={UI_TEXT.cabinetRolesPage.createMaster}
            actionHref={createMasterHref}
            actionMethod="POST"
          />
        )}

        {hasStudioProfile && studioData ? (
          <RoleCardStudio
            mode="active"
            data={studioData}
            onDelete={() => {
              setConfirmDelete("studio");
              setError(null);
              setActiveBookingsCount(null);
            }}
          />
        ) : hasMasterProfile ? (
          <RoleCardStudio
            mode="upsell"
            actionLabel={UI_TEXT.cabinetRolesPage.createStudio}
            actionHref={createStudioHref}
            actionMethod="POST"
          />
        ) : (
          <RoleCardStudio
            mode="empty"
            actionLabel={UI_TEXT.cabinetRolesPage.createStudio}
            actionHref={createStudioHref}
            actionMethod="POST"
          />
        )}
      </div>

      <DeleteCabinetModal
        open={Boolean(confirmDelete)}
        type={deleteLabel === "master" ? "master" : "studio"}
        onCancel={closeModal}
        onConfirm={submitDelete}
        loading={deleting}
        activeBookingsCount={activeBookingsCount}
        error={error}
      />
    </>
  );
}
