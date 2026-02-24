import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/auth/otp";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { buildPhoneVariants } from "@/lib/crm/card-utils";
import { logInfo } from "@/lib/logging/logger";

export type LinkGuestBookingsResult = {
  matched: number;
  linked: number;
  skippedAlreadyLinked: number;
  skippedOtherOwner: number;
};

const EMPTY_RESULT: LinkGuestBookingsResult = {
  matched: 0,
  linked: 0,
  skippedAlreadyLinked: 0,
  skippedOtherOwner: 0,
};

export function buildPhoneVariantsForMatch(phoneRaw: string): { normalized: string; variants: string[] } {
  const trimmed = phoneRaw.trim();
  if (!trimmed) return { normalized: "", variants: [] };

  const normalized = normalizePhone(trimmed);
  if (!normalized || normalized.length < 8) {
    return { normalized: "", variants: [] };
  }

  const variants = new Set<string>();
  variants.add(normalized);
  if (normalized.startsWith("+")) {
    variants.add(normalized.slice(1));
  }
  variants.add(trimmed);

  const ruNormalized = normalizeRussianPhone(trimmed) ?? normalizeRussianPhone(normalized);
  if (ruNormalized) {
    for (const variant of buildPhoneVariants(ruNormalized)) {
      variants.add(variant);
    }
  }

  return { normalized, variants: Array.from(variants).filter((value) => value.length > 0) };
}

function maskPhone(input: string): string {
  const normalized = normalizePhone(input);
  const digits = normalized.replace(/\D/g, "");
  if (!digits) return "";
  const suffix = digits.slice(-4);
  const prefix = normalized.startsWith("+") ? "+" : "";
  const lead = digits.slice(0, 1);
  return `${prefix}${lead}******${suffix}`;
}

export async function linkGuestBookingsToUserByPhone(input: {
  userProfileId: string;
  phoneRaw: string;
}): Promise<LinkGuestBookingsResult> {
  const { userProfileId, phoneRaw } = input;
  if (!userProfileId) return EMPTY_RESULT;

  const { normalized, variants } = buildPhoneVariantsForMatch(phoneRaw);
  if (variants.length === 0) return EMPTY_RESULT;

  const matchFilter: Prisma.BookingWhereInput = {
    OR: [
      { clientPhone: { in: variants } },
      { clientPhoneSnapshot: { in: variants } },
    ],
  };

  const [alreadyLinked, otherOwner, linkedResult] = await prisma.$transaction([
    prisma.booking.count({
      where: { AND: [matchFilter, { clientUserId: userProfileId }] },
    }),
    prisma.booking.count({
      where: {
        AND: [matchFilter, { clientUserId: { not: null } }, { NOT: { clientUserId: userProfileId } }],
      },
    }),
    prisma.booking.updateMany({
      where: { AND: [matchFilter, { clientUserId: null }] },
      data: { clientUserId: userProfileId },
    }),
  ]);

  const linked = linkedResult.count;
  const matched = alreadyLinked + otherOwner + linked;
  const result: LinkGuestBookingsResult = {
    matched,
    linked,
    skippedAlreadyLinked: alreadyLinked,
    skippedOtherOwner: otherOwner,
  };

  logInfo("linkGuestBookingsToUserByPhone", {
    userProfileId,
    phone: maskPhone(normalized || phoneRaw),
    ...result,
  });

  return result;
}
