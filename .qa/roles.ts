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
  | "site-admin";

export type Role = {
  key: RoleKey;
  index: number;
  label: string;
  phone: string;
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
    roles: "CLIENT, MASTER",
    expectedLanding: "/cabinet/master/dashboard",
    landingNote: "Anna Sokolova — Provider type MASTER, studioId NULL.",
  },
  {
    key: "studio-admin",
    index: 2,
    label: "Studio admin",
    phone: "+79992000000",
    roles: "CLIENT, STUDIO, STUDIO_ADMIN",
    expectedLanding: "/cabinet/studio",
    landingNote: "Victoria Almazova — owner of Vision studio.",
  },
  {
    key: "master-in-studio",
    index: 3,
    label: "Master in studio",
    phone: "+79993000000",
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
    roles: "CLIENT",
    expectedLanding: "/cabinet/profile",
    landingNote: "Elena Petrova — pure client.",
  },
  {
    key: "site-admin",
    index: 5,
    label: "Site admin",
    phone: "+79994000000",
    roles: "CLIENT, ADMIN",
    expectedLanding: "/admin",
    landingNote:
      "QA-002 (FIX-08): a platform admin (roles CLIENT,ADMIN) now lands on /admin after OTP login (was /cabinet/profile — the redirect had no ADMIN branch).",
  },
];
