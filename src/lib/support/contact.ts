import { normalizeRussianPhone } from "@/lib/phone/russia";
import { prisma } from "@/lib/prisma";
import {
  normalizeSupportContact,
  type SupportContactOption,
  type SupportContactOptionKind,
} from "@/lib/support/contact-shared";

export type SupportContactSource = SupportContactOptionKind | "none";

type SupportContactUser = {
  id: string;
  email: string | null;
  phone: string | null;
  telegramId: string | null;
};

function buildLabel(kind: SupportContactOptionKind, value: string): string {
  if (kind === "phone") return `\u0422\u0435\u043b\u0435\u0444\u043e\u043d: ${value}`;
  if (kind === "telegram") return `Telegram: ${value}`;
  if (kind === "vk") return `VK: ${value}`;
  return `Email: ${value}`;
}

function buildOption(kind: SupportContactOptionKind, value: string | null): SupportContactOption | null {
  const normalized = normalizeSupportContact(value);
  if (!normalized) return null;
  const label = buildLabel(kind, normalized);
  return {
    kind,
    value: label,
    label,
  };
}

function normalizePhoneForContact(input: string | null): string | null {
  const normalized = normalizeSupportContact(input);
  if (!normalized) return null;
  return normalizeRussianPhone(normalized) ?? normalized;
}

export async function buildSupportContactOptionsFromUser(
  user: SupportContactUser | null | undefined
): Promise<SupportContactOption[]> {
  if (!user) return [];

  const options: SupportContactOption[] = [];
  const seen = new Set<string>();
  const pushUnique = (option: SupportContactOption | null) => {
    if (!option || seen.has(option.value)) return;
    seen.add(option.value);
    options.push(option);
  };

  pushUnique(buildOption("phone", normalizePhoneForContact(user.phone)));
  pushUnique(buildOption("telegram", user.telegramId));

  const vkLink = await prisma.vkLink.findUnique({
    where: { userId: user.id },
    select: { vkUserId: true },
  });
  pushUnique(buildOption("vk", vkLink?.vkUserId ?? null));
  pushUnique(buildOption("email", user.email));

  return options;
}

export async function resolveSupportContactFromUser(
  user: SupportContactUser | null | undefined
): Promise<{ contact: string | null; source: SupportContactSource; options: SupportContactOption[] }> {
  const options = await buildSupportContactOptionsFromUser(user);
  const first = options[0] ?? null;
  return {
    contact: first?.value ?? null,
    source: first?.kind ?? "none",
    options,
  };
}

