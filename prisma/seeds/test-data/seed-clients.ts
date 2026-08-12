import { AccountType, type UserProfile } from "@prisma/client";
import { prisma } from "./helpers/prisma";
import { logSeed } from "./helpers/log";
import { seedEmail, seedPhone } from "./helpers/markers";
import { transliterate } from "./helpers/transliterate";
import {
  FIRST_NAMES_F,
  FIRST_NAMES_M,
  LAST_NAMES_F,
  LAST_NAMES_M,
} from "./data/russian-names";

const CLIENT_COUNT = 15;
const CLIENT_PHONE_BASE = 100; // +79000000100 .. +79000000114

export async function seedClients(): Promise<UserProfile[]> {
  logSeed.section("Clients");
  const out: UserProfile[] = [];

  // Mix male + female names for clients (catalog audience is broader than
  // the masters' female-skew). Half male, half female; deterministic ordering.
  for (let i = 0; i < CLIENT_COUNT; i++) {
    const isMale = i % 2 === 1;
    const first = isMale
      ? FIRST_NAMES_M[i % FIRST_NAMES_M.length]!
      : FIRST_NAMES_F[(i + 11) % FIRST_NAMES_F.length]!;
    const last = isMale
      ? LAST_NAMES_M[i % LAST_NAMES_M.length]!
      : LAST_NAMES_F[(i + 13) % LAST_NAMES_F.length]!;
    const slug = `${transliterate(first)}-${transliterate(last)}-${i + 1}`;

    // EMAIL-ADDRESS-OCCUPATION: `email` больше не `@unique` целиком (уникальность
    // частичная — только по подтверждённым), поэтому `upsert by email` не
    // выражается: `where` у `upsert` принимает лишь уникальные поля. Ключ сидов —
    // телефон (он `@unique` и остаётся им), а seed-email лишь проставляется.
    // Идемпотентность сохранена: повторный прогон найдёт ту же строку.
    const row = await prisma.userProfile.upsert({
      where: { phone: seedPhone(CLIENT_PHONE_BASE + i) },
      update: {
        email: seedEmail("client", slug),
        firstName: first,
        lastName: last,
        displayName: `${first} ${last}`,
      },
      create: {
        email: seedEmail("client", slug),
        phone: seedPhone(CLIENT_PHONE_BASE + i),
        firstName: first,
        lastName: last,
        displayName: `${first} ${last}`,
        roles: [AccountType.CLIENT],
      },
    });
    out.push(row);
  }
  logSeed.ok(`${out.length} clients upserted`);
  return out;
}
