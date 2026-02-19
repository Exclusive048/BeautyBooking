import { AppError } from "@/lib/api/errors";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { prisma } from "@/lib/prisma";

export type ClientKeyType = "user" | "phone";

export type ClientKeyData = {
  type: ClientKeyType;
  value: string;
  key: string;
};

export function buildClientKey(input: {
  clientUserId?: string | null;
  clientPhone?: string | null;
}): ClientKeyData {
  if (input.clientUserId) {
    return { type: "user", value: input.clientUserId, key: `user:${input.clientUserId}` };
  }

  const rawPhone = input.clientPhone?.trim() ?? "";
  const normalized = rawPhone ? normalizeRussianPhone(rawPhone) : null;
  if (!normalized) {
    throw new AppError("Недостаточно данных клиента", 400, "CLIENT_KEY_INVALID");
  }

  return { type: "phone", value: normalized, key: `phone:${normalized}` };
}

export function parseClientKey(clientKey: string): ClientKeyData | null {
  const match = /^(user|phone):(.+)$/.exec(clientKey);
  if (!match) return null;
  const type = match[1] as ClientKeyType;
  const rawValue = match[2]?.trim();
  if (!rawValue) return null;

  if (type === "user") {
    return { type, value: rawValue, key: `user:${rawValue}` };
  }

  const normalized = normalizeRussianPhone(rawValue);
  if (!normalized) return null;
  return { type, value: normalized, key: `phone:${normalized}` };
}

export async function findCardByKey(providerId: string, key: string) {
  const parsed = parseClientKey(key);
  if (!parsed) return null;
  if (parsed.type === "user") {
    return prisma.clientCard.findFirst({
      where: { providerId, clientUserId: parsed.value },
      include: { photos: { include: { mediaAsset: true } } },
    });
  }
  return prisma.clientCard.findFirst({
    where: { providerId, clientPhone: parsed.value },
    include: { photos: { include: { mediaAsset: true } } },
  });
}
