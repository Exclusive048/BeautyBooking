import type { Prisma, PrismaClient } from "@prisma/client";
import { ProviderType } from "@prisma/client";
import { AppError } from "@/lib/api/errors";

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 32;
const USERNAME_RANDOM_SUFFIX_LENGTH = 4;
const BANNED_USERNAMES = new Set([
  "admin",
  "api",
  "cabinet",
  "u",
  "login",
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
  findProviderByUsername: (username: string) => Promise<{
    id: string;
    publicUsername: string | null;
    isPublished: boolean;
    type: ProviderType;
  } | null>;
  findAlias: (username: string) => Promise<{ providerId: string } | null>;
  findProviderById: (id: string) => Promise<{
    publicUsername: string | null;
    isPublished: boolean;
  } | null>;
};

export type ResolvePublicUsernameResult =
  | { status: "found"; providerId: string; providerType: ProviderType }
  | { status: "redirect"; username: string }
  | { status: "not-found" };

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

  if (BANNED_USERNAMES.has(username)) {
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
  const [provider, alias] = await Promise.all([
    prismaTx.provider.findFirst({
      where: { publicUsername: username },
      select: { id: true },
    }),
    prismaTx.publicUsernameAlias.findUnique({
      where: { username },
      select: { id: true },
    }),
  ]);

  return Boolean(provider || alias);
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
    return { status: "not-found" };
  }

  const provider = await deps.findProviderByUsername(normalized);
  if (provider) {
    if (!provider.isPublished) {
      return { status: "not-found" };
    }
    return { status: "found", providerId: provider.id, providerType: provider.type };
  }

  const alias = await deps.findAlias(normalized);
  if (!alias) {
    return { status: "not-found" };
  }

  const aliasProvider = await deps.findProviderById(alias.providerId);
  if (!aliasProvider || !aliasProvider.isPublished || !aliasProvider.publicUsername) {
    return { status: "not-found" };
  }

  return { status: "redirect", username: aliasProvider.publicUsername };
}
