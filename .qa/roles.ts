// QA harness — role registry.
//
// Each of the five roles maps to a concrete *seeded* showcase account
// (markers.ts: SHOWCASE_PHONE_*). `expectedLanding` is what the OTP
// verify endpoint's resolveCabinetRedirect() SHOULD return for that
// role — it is the source of truth the login smoke asserts against.
//
// Landing logic (src/lib/auth/cabinet-redirect.ts):
//   hasStudioAdmin && !hasMaster -> /cabinet/studio
//   hasMaster && !hasStudioAdmin -> /cabinet/master/dashboard
//   isAdmin (ADMIN/SUPERADMIN)   -> /admin           (QA-002 / FIX-08)
//   else                         -> /cabinet/profile

export type RoleKey =
  | "master"
  | "studio-admin"
  | "master-in-studio"
  | "client"
  | "site-admin"
  // SEED-FRESHNESS-01 billing/plan-gating fixtures (unpublished MASTER providers).
  | "billing-free"
  | "billing-premium"
  | "billing-grace"
  | "billing-expired";

export type Role = {
  key: RoleKey;
  index: number;
  label: string;
  phone: string;
  /**
   * QA-HARNESS-EMAIL-01 — the SAME account's email identity.
   *
   * These are not new fixtures: every showcase account already carries an
   * email in the seeds (`UserProfile.email`), so the registry only surfaces
   * what is on disk — `prisma/seeds/` is untouched. That matters because email
   * login resolves the profile by `UserProfile.email` @unique, i.e. logging in
   * by email lands on the very same row (and the same `expectedLanding`) as
   * logging in by phone. `emailVerifiedAt` is NOT required by the login path.
   *
   * Elena's is a real-looking external address rather than a
   * `@test.masterryadom.local` one — that is what makes the dev mail sink a
   * safety property and not just a speed one (see docker-compose.dev.yml).
   */
  email: string;
  roles: string;
  expectedLanding: string;
  landingNote?: string;
};

export const ROLES: Role[] = [
  {
    key: "master",
    index: 1,
    label: "Master (independent)",
    phone: "+79991000000",
    email: "seed-master-anna-sokolova@test.masterryadom.local",
    roles: "CLIENT, MASTER",
    expectedLanding: "/cabinet/master/dashboard",
    landingNote: "Anna Sokolova — Provider type MASTER, studioId NULL.",
  },
  {
    key: "studio-admin",
    index: 2,
    label: "Studio admin",
    phone: "+79992000000",
    email: "seed-studio-vision@test.masterryadom.local",
    roles: "CLIENT, STUDIO, STUDIO_ADMIN",
    expectedLanding: "/cabinet/studio",
    landingNote: "Victoria Almazova — owner of Vision studio.",
  },
  {
    key: "master-in-studio",
    index: 3,
    label: "Master in studio",
    phone: "+79993000000",
    email: "seed-master-vision-marina-lebedeva-1@test.masterryadom.local",
    roles: "CLIENT, MASTER",
    expectedLanding: "/cabinet/master/dashboard",
    landingNote:
      "Marina Lebedeva — Provider type MASTER with studioId set + ACTIVE StudioMembership(MASTER). Lands on master cabinet (not a studio admin).",
  },
  {
    key: "client",
    index: 4,
    label: "Client",
    phone: "+79995000000",
    email: "elena.petrova.91@yandex.ru",
    roles: "CLIENT",
    expectedLanding: "/cabinet/profile",
    landingNote: "Elena Petrova — pure client.",
  },
  {
    key: "site-admin",
    index: 5,
    label: "Site admin",
    phone: "+79994000000",
    email: "seed-admin-platform@test.masterryadom.local",
    roles: "CLIENT, ADMIN",
    expectedLanding: "/admin",
    landingNote:
      "QA-002 (FIX-08): a platform admin (roles CLIENT,ADMIN) now lands on /admin after OTP login (was /cabinet/profile — the redirect had no ADMIN branch).",
  },
  // ── SEED-FRESHNESS-01 plan-gating fixtures (unpublished MASTER providers). ──
  // Land on the master cabinet; used to drive tier gating + grace/expired access.
  {
    key: "billing-free",
    index: 6,
    label: "Billing FREE master",
    phone: "+79000009001",
    email: "seed-master-billing-free-master@test.masterryadom.local",
    roles: "CLIENT, MASTER",
    expectedLanding: "/cabinet/master/dashboard",
    landingNote: "MASTER_FREE ACTIVE — lower-tier gating baseline (billing-free-master).",
  },
  {
    key: "billing-premium",
    index: 7,
    label: "Billing PREMIUM master",
    phone: "+79000009002",
    email: "seed-master-billing-premium-master@test.masterryadom.local",
    roles: "CLIENT, MASTER",
    expectedLanding: "/cabinet/master/dashboard",
    landingNote: "MASTER_PREMIUM ACTIVE — completes FREE/PRO(Anna)/PREMIUM triad (billing-premium-master).",
  },
  {
    key: "billing-grace",
    index: 8,
    label: "Billing grace master",
    phone: "+79000009003",
    email: "seed-master-billing-grace-master@test.masterryadom.local",
    roles: "CLIENT, MASTER",
    expectedLanding: "/cabinet/master/dashboard",
    landingNote: "MASTER_PRO PAST_DUE + graceUntil>now — HARDENING-03 grace KEEPS access (billing-grace-master).",
  },
  {
    key: "billing-expired",
    index: 9,
    label: "Billing expired master",
    phone: "+79000009004",
    email: "seed-master-billing-expired-master@test.masterryadom.local",
    roles: "CLIENT, MASTER",
    expectedLanding: "/cabinet/master/dashboard",
    landingNote: "MASTER_PRO EXPIRED — access LOST (billing-expired-master).",
  },
];
