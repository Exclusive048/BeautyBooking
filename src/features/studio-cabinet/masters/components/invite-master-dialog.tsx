"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.mastersV2.inviteDialog;
const E = UI_TEXT.studioCabinet.mastersV2.errors;

type Props = {
  studioId: string;
  open: boolean;
  onClose: () => void;
};

export function InviteMasterDialog({ studioId, open, onClose }: Props) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [tagline, setTagline] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPhone("");
    setDisplayName("");
    setTagline("");
    setError(null);
    setSubmitting(false);
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  async function handleSubmit() {
    const normalizedPhone = normalizeRussianPhone(phone);
    const trimmedName = displayName.trim();
    const trimmedTagline = tagline.trim();
    if (!normalizedPhone) {
      setError(E.phoneInvalid);
      return;
    }
    if (!trimmedName) {
      setError(E.nameRequired);
      return;
    }
    if (!trimmedTagline) {
      setError(E.taglineRequired);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/studio/masters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studioId,
          phone: normalizedPhone,
          displayName: trimmedName,
          title: trimmedTagline,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? E.inviteFailed);
        return;
      }
      reset();
      onClose();
      router.refresh();
    } catch {
      setError(E.inviteFailed);
    } finally {
      setSubmitting(false);
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
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-text-main">
          {T.phoneLabel}
        </span>
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={T.phonePlaceholder}
          disabled={submitting}
          inputMode="tel"
          autoComplete="tel"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-text-main">
          {T.nameLabel}
        </span>
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={T.namePlaceholder}
          disabled={submitting}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-text-main">
          {T.taglineLabel}
        </span>
        <Input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder={T.taglinePlaceholder}
          disabled={submitting}
        />
      </label>
    </FormDialog>
  );
}
