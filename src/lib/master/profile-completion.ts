/**
 * Pure rules for the profile completion meter (31a).
 *
 * Six sections, equal weight (1/6 each). Total rounded to int. The
 * sidebar's progress bar reads this directly; the section nav uses
 * `bySection` for the per-row checkmark.
 *
 * `publicUsername` is intentionally **not** part of the Header
 * completion check — Provider.publicUsername is nullable in schema
 * and editing it is on the 31b backlog (alias logic). Including it
 * would block a new master from ever reaching 100% via this surface.
 */

const ABOUT_MIN_CHARS = 30;

export type ProfileCompletionInput = {
  header: {
    name: string | null;
    tagline: string | null;
    avatarUrl: string | null;
  };
  contacts: {
    phone: string | null;
  };
  about: {
    bio: string | null;
  };
  location: {
    address: string | null;
    cityId: string | null;
  };
  servicesCount: number;
  portfolioCount: number;
};

export type ProfileSectionId =
  | "header"
  | "contacts"
  | "about"
  | "location"
  | "services"
  | "portfolio";

export type ProfileCompletion = {
  /** 0..100 integer */
  percent: number;
  /** Per-section completed flag — drives sidebar nav checkmarks. */
  bySection: Record<ProfileSectionId, boolean>;
};

export function computeProfileCompletion(input: ProfileCompletionInput): ProfileCompletion {
  const bySection: Record<ProfileSectionId, boolean> = {
    header: Boolean(
      nonEmpty(input.header.name) &&
        nonEmpty(input.header.tagline) &&
        nonEmpty(input.header.avatarUrl)
    ),
    contacts: Boolean(nonEmpty(input.contacts.phone)),
    about: Boolean(input.about.bio && input.about.bio.trim().length >= ABOUT_MIN_CHARS),
    location: Boolean(nonEmpty(input.location.address) && nonEmpty(input.location.cityId)),
    services: input.servicesCount > 0,
    portfolio: input.portfolioCount > 0,
  };

  const completedCount = Object.values(bySection).filter(Boolean).length;
  const total = Object.keys(bySection).length;
  const percent = Math.round((completedCount / total) * 100);

  return { percent, bySection };
}

function nonEmpty(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export const PROFILE_COMPLETION_THRESHOLDS = {
  ABOUT_MIN_CHARS,
} as const;
