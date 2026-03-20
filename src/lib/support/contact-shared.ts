export const SUPPORT_CONTACT_MAX_LENGTH = 200;

export type SupportContactOptionKind = "phone" | "telegram" | "vk" | "email";
export type SupportContactInputSource = "profile_option" | "manual_input";

export type SupportContactOption = {
  kind: SupportContactOptionKind;
  value: string;
  label: string;
};

export function normalizeSupportContact(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, SUPPORT_CONTACT_MAX_LENGTH);
}

