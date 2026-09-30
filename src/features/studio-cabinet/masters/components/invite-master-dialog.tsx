"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

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
    // STUDIO-INVITE-EMAIL-01: одно поле на оба контакта — «@» значит почта.
    const contact = phone.trim();
    const isEmail = contact.includes("@");
    const email = isEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? contact.toLowerCase() : null;
    const normalizedPhone = isEmail ? null : normalizeRussianPhone(contact);
    const trimmedName = displayName.trim();
    const trimmedTagline = tagline.trim();
    if (!email && !normalizedPhone) {
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
      await fetchJsonWithAuth<unknown>("/api/studio/masters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studioId,
          ...(email ? { email } : { phone: normalizedPhone }),
          displayName: trimmedName,
          title: trimmedTagline,
        }),
      });
      reset();
      onClose();
      router.refresh();
    } catch (error) {
      setError(serverMessageOr(error, E.inviteFailed));
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
          inputMode="email"
          autoComplete="off"
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
