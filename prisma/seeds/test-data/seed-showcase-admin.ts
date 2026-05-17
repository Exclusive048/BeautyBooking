/**
 * Showcase admin — a platform-admin account used to validate the
 * `/admin` panel (catalog moderation, billing, users, settings, etc).
 *
 * Identity:
 *   phone:    +79994000000  (SHOWCASE_PHONE_ADMIN — schema 100/200/300/400)
 *   email:    seed-admin-platform@test.masterryadom.local
 *             — caught by reset.ts via SEED_EMAIL_DOMAIN.
 *   roles:    [CLIENT, ADMIN]  — minimal admin grant. SUPERADMIN
 *             reserved for future scope; not seeded here to keep blast
 *             radius small.
 *
 * Idempotent via `ensureUserByPhone` (SEED-CONSOLIDATION-A). The admin
 * account carries no domain data (no provider, no studio, no bookings)
 * — the goal is solely to unlock the `/admin` route for testing the
 * Phase 2 surfaces. Real admin workflows are tested against the data
 * seeded by `seedGeneric` + `seedShowcase{Master,Studio}`.
 */

import { AccountType, type UserProfile } from "@prisma/client";
import { logSeed } from "./helpers/log";
import { ensureUserByPhone } from "./helpers/ensure-user";
import { SHOWCASE_PHONE_ADMIN, seedEmail } from "./helpers/markers";

const PHONE = SHOWCASE_PHONE_ADMIN;
const EMAIL = seedEmail("admin", "platform");
const FIRST_NAME = "Платформа";
const LAST_NAME = "Админ";

export async function seedShowcaseAdmin(): Promise<UserProfile> {
  logSeed.section("Showcase admin");
  const user = await ensureUserByPhone({
    phone: PHONE,
    email: EMAIL,
    publicUsername: null,
    firstName: FIRST_NAME,
    lastName: LAST_NAME,
    displayName: `${FIRST_NAME} ${LAST_NAME}`,
    roles: [AccountType.CLIENT, AccountType.ADMIN],
  });
  logSeed.ok(`Готово. Login: phone ${PHONE} → /admin`);
  return user;
}
