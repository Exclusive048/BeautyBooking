import type { Prisma, PrismaClient } from "@prisma/client";
import { ProviderType } from "@prisma/client";
import { AppError } from "@/lib/api/errors";

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 32;
const USERNAME_RANDOM_SUFFIX_LENGTH = 4;

export const RESERVED_SLUGS = new Set([
  "booking",
  "settings",
  "admin",
  "api",
  "u",
  "c",
  "auth",
  "login",
  "logout",
  "cabinet",
  "providers",
  "studios",
  "clients",
  "sitemap.xml",
  "robots.txt",
  "about",
  "become-master",
  "blog",
  "book",
  "careers",
  "catalog",
  "faq",
  "gift-cards",
  "help",
  "how-it-works",
  "how-to-book",
  "notifications",
  "partners",
  "pricing",
  "privacy",
  "support",
  "terms",
  "hot",
  "inspiration",
  "403",
  "favicon.ico",
  "signup",
  "static",
  "public",
]);

export type UsernameValidationResult = { ok: true } | { ok: false; reason: string };

export type GenerateDefaultUsernameParams = {
  providerType: ProviderType;
  firstName?: string | null;
  lastName?: string | null;
  allowLastName?: boolean;
  studioName?: string | null;
  specialization?: string | null;
  serviceCategory?: string | null;
};

export type ResolvePublicUsernameDeps = {
  findProviderByUsernameOrAlias: (username: string) => Promise<{
    id: string;
    publicUsername: string | null;
    isPublished: boolean;
    type: ProviderType;
  } | null>;
};

export type ResolvePublicUsernameResult =
  | { status: "found"; providerId: string; providerType: ProviderType }
  | { status: "redirect"; username: string }
  | {
      status: "not-found";
      reason: "invalid" | "missing" | "unpublished" | "alias-unpublished";
    };

export type ResolvePublicClientUsernameDeps = {
  findClientByUsernameOrAlias: (username: string) => Promise<{
    id: string;
    publicUsername: string | null;
  } | null>;
};

export type ResolvePublicClientUsernameResult =
  | { status: "found"; clientId: string }
  | { status: "redirect"; username: string }
  | { status: "not-found"; reason: "invalid" | "missing" };

type PrismaTx = Prisma.TransactionClient | PrismaClient;

function normalizeBase(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function stripHyphens(value: string): string {
  return value.replace(/^-+/, "").replace(/-+$/, "");
}

function randomSuffix(length: number = USERNAME_RANDOM_SUFFIX_LENGTH): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

export function normalizeUsernameInput(input: string): string {
  return input.trim().toLowerCase();
}

export function slugifyUsername(input: string): string {
  const normalized = normalizeBase(input).toLowerCase();
  if (!normalized) return "";
  const replaced = normalized
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-");
  return stripHyphens(replaced);
}

export function validateUsername(username: string): UsernameValidationResult {
  if (!username) {
    return { ok: false, reason: "Введите username." };
  }

  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return { ok: false, reason: "Длина username должна быть от 3 до 32 символов." };
  }

  if (!/^[a-z0-9-]+$/.test(username)) {
    return { ok: false, reason: "Разрешены только латинские буквы, цифры и дефис." };
  }

  if (username.startsWith("-") || username.endsWith("-")) {
    return { ok: false, reason: "Дефис не может быть в начале или в конце." };
  }

  if (username.includes("--")) {
    return { ok: false, reason: "Двойные дефисы подряд недопустимы." };
  }

  if (/^\d+$/.test(username)) {
    return { ok: false, reason: "Username не может состоять только из цифр." };
  }

  if (RESERVED_SLUGS.has(username)) {
    return { ok: false, reason: "Этот username нельзя использовать." };
  }

  return { ok: true };
}

function buildCandidate(base: string, suffix?: string): string {
  const trimmedBase = stripHyphens(base);
  if (!suffix) return trimmedBase.slice(0, USERNAME_MAX_LENGTH);
  const reserved = suffix.length + 1;
  const available = USERNAME_MAX_LENGTH - reserved;
  const basePart = stripHyphens(trimmedBase.slice(0, Math.max(available, 0)));
  return `${basePart}-${suffix}`;
}

export function generateDefaultUsername(params: GenerateDefaultUsernameParams): string {
  if (params.providerType === ProviderType.STUDIO) {
    const baseStudio = slugifyUsername(normalizeBase(params.studioName));
    if (baseStudio && validateUsername(baseStudio).ok) return baseStudio;
    const fallbackStudio = buildCandidate("studio", randomSuffix());
    return fallbackStudio;
  }

  const firstName = normalizeBase(params.firstName);
  const lastName = params.allowLastName ? normalizeBase(params.lastName) : "";
  const specialization = normalizeBase(params.specialization) || normalizeBase(params.serviceCategory) || "beauty";
  const parts = [firstName, lastName, specialization].filter(Boolean).join("-");
  const baseMaster = slugifyUsername(parts);
  if (baseMaster && validateUsername(baseMaster).ok) return baseMaster;

  const fallbackMaster = slugifyUsername([firstName, "master"].filter(Boolean).join("-"));
  if (fallbackMaster && validateUsername(fallbackMaster).ok) return fallbackMaster;

  return buildCandidate("master", randomSuffix());
}

export async function isUsernameTaken(prismaTx: PrismaTx, username: string): Promise<boolean> {
  const [provider, client, alias] = await Promise.all([
    prismaTx.provider.findUnique({
      where: { publicUsername: username },
      select: { id: true },
    }),
    prismaTx.userProfile.findUnique({
      where: { publicUsername: username },
      select: { id: true },
    }),
    prismaTx.publicUsernameAlias.findUnique({
      where: { username },
      select: { id: true },
    }),
  ]);

  return Boolean(provider || client || alias);
}

export async function ensureUniqueUsername(prismaTx: PrismaTx, baseUsername: string): Promise<string> {
  const base = slugifyUsername(baseUsername);
  const validation = validateUsername(base);
  if (!validation.ok) {
    throw new AppError(validation.reason, 400, "VALIDATION_ERROR");
  }

  if (!(await isUsernameTaken(prismaTx, base))) {
    return base;
  }

  for (let i = 2; i < 1000; i += 1) {
    const candidate = buildCandidate(base, String(i));
    if (!validateUsername(candidate).ok) continue;
    if (!(await isUsernameTaken(prismaTx, candidate))) {
      return candidate;
    }
  }

  throw new AppError("Не удалось подобрать свободный username.", 409, "CONFLICT");
}

export async function resolvePublicUsername(
  deps: ResolvePublicUsernameDeps,
  rawUsername: string
): Promise<ResolvePublicUsernameResult> {
  const normalized = slugifyUsername(rawUsername);
  if (!normalized || !validateUsername(normalized).ok) {
    return { status: "not-found", reason: "invalid" };
  }

  let provider = await deps.findProviderByUsernameOrAlias(normalized);

  // Fallback: if not found by slugified username, try the exact (lowercased) input.
  // This handles legacy usernames that contain underscores or other characters
  // that slugifyUsername converts to hyphens (e.g. "anna_nails" → "anna-nails").
  if (!provider) {
    const rawLower = rawUsername.trim().toLowerCase();
    if (rawLower !== normalized && rawLower.length >= 3) {
      const rawProvider = await deps.findProviderByUsernameOrAlias(rawLower);
      // Only treat as a direct match if publicUsername exactly equals what was requested,
      // to avoid triggering the alias-redirect logic below.
      if (rawProvider?.publicUsername === rawLower) {
        if (!rawProvider.isPublished) {
          return { status: "not-found", reason: "unpublished" };
        }
        return { status: "found", providerId: rawProvider.id, providerType: rawProvider.type };
      }
      provider = rawProvider ?? null;
    }
  }

  if (!provider) {
    return { status: "not-found", reason: "missing" };
  }

  const matchedAlias = provider.publicUsername !== normalized;
  if (!provider.publicUsername) {
    return { status: "not-found", reason: "alias-unpublished" };
  }

  if (!provider.isPublished) {
    return { status: "not-found", reason: matchedAlias ? "alias-unpublished" : "unpublished" };
  }

  if (matchedAlias) {
    return { status: "redirect", username: provider.publicUsername };
  }

  return { status: "found", providerId: provider.id, providerType: provider.type };
}

export async function resolvePublicClientUsername(
  deps: ResolvePublicClientUsernameDeps,
  rawUsername: string
): Promise<ResolvePublicClientUsernameResult> {
  const normalized = slugifyUsername(rawUsername);
  if (!normalized || !validateUsername(normalized).ok) {
    return { status: "not-found", reason: "invalid" };
  }

  const client = await deps.findClientByUsernameOrAlias(normalized);
  if (!client) {
    return { status: "not-found", reason: "missing" };
  }

  if (!client.publicUsername) {
    return { status: "not-found", reason: "missing" };
  }

  if (client.publicUsername !== normalized) {
    return { status: "redirect", username: client.publicUsername };
  }

  return { status: "found", clientId: client.id };
}
