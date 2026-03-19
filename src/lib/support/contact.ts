import { prisma } from "@/lib/prisma";

const CONTACT_BY_PROVIDER = {
  telegram: "Telegram",
  vk: "VK",
  sms: "SMS",
} as const;

export type SupportContactSource = "email" | "telegram" | "vk" | "sms" | "none";

type SupportContactUser = {
  id: string;
  email: string | null;
  phone: string | null;
  telegramId: string | null;
};

export const SUPPORT_CONTACT_MAX_LENGTH = 200;

export function normalizeSupportContact(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, SUPPORT_CONTACT_MAX_LENGTH);
}

export async function resolveSupportContactFromUser(
  user: SupportContactUser | null | undefined
): Promise<{ contact: string | null; source: SupportContactSource }> {
  if (!user) {
    return { contact: null, source: "none" };
  }

  const email = normalizeSupportContact(user.email);
  if (email) {
    return { contact: email, source: "email" };
  }

  if (normalizeSupportContact(user.telegramId)) {
    return { contact: CONTACT_BY_PROVIDER.telegram, source: "telegram" };
  }

  const vkLink = await prisma.vkLink.findUnique({
    where: { userId: user.id },
    select: { vkUserId: true },
  });
  if (normalizeSupportContact(vkLink?.vkUserId ?? null)) {
    return { contact: CONTACT_BY_PROVIDER.vk, source: "vk" };
  }

  if (normalizeSupportContact(user.phone)) {
    return { contact: CONTACT_BY_PROVIDER.sms, source: "sms" };
  }

  return { contact: null, source: "none" };
}

