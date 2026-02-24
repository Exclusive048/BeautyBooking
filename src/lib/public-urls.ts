import { alert } from "@/lib/alerting";

export interface PublicUrlable {
  id: string;
  publicUsername: string | null;
}

export class MissingPublicUsernameError extends Error {
  providerId?: string;
  clientId?: string;
  context?: string;

  constructor(input: { providerId?: string; clientId?: string; context?: string }) {
    super("Публичный username отсутствует.");
    this.name = "MissingPublicUsernameError";
    this.providerId = input.providerId;
    this.clientId = input.clientId;
    this.context = input.context;
  }
}

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue | QueryValue[]>;

function pushParam(list: string[], key: string, value: QueryValue) {
  if (value === null || value === undefined) return;
  list.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
}

export function withQuery(base: string, params?: QueryParams): string {
  if (!params) return base;
  const keys = Object.keys(params).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const value = params[key];
    if (Array.isArray(value)) {
      for (const entry of value) {
        pushParam(parts, key, entry);
      }
      continue;
    }
    pushParam(parts, key, value);
  }
  if (parts.length === 0) return base;
  const joiner = base.includes("?") ? "&" : "?";
  return `${base}${joiner}${parts.join("&")}`;
}

function reportMissing(input: { kind: "provider" | "client"; id: string; context?: string }) {
  const error =
    input.kind === "provider"
      ? new MissingPublicUsernameError({ providerId: input.id, context: input.context })
      : new MissingPublicUsernameError({ clientId: input.id, context: input.context });
  alert("Публичный username не задан, используем ссылку по ID.", {
    error,
    kind: input.kind,
    id: input.id,
    context: input.context ?? null,
  });
}

export function providerPublicUrl(
  entity: PublicUrlable,
  context?: string,
  fallbackPrefix: "providers" | "studios" = "providers"
): string {
  if (!entity.publicUsername) {
    reportMissing({ kind: "provider", id: entity.id, context });
    return `/${fallbackPrefix}/${entity.id}`;
  }
  return `/u/${entity.publicUsername}`;
}

export function clientPublicUrl(entity: PublicUrlable, context?: string): string {
  if (!entity.publicUsername) {
    reportMissing({ kind: "client", id: entity.id, context });
    return `/clients/${entity.id}`;
  }
  return `/c/${entity.publicUsername}`;
}

export function studioBookingUrl(
  studio: PublicUrlable,
  params?: QueryParams,
  context: string = "studio-booking"
): string {
  if (!studio.publicUsername) {
    reportMissing({ kind: "provider", id: studio.id, context });
  }
  const studioKey = studio.publicUsername ?? studio.id;
  return withQuery(`/u/${studioKey}/booking`, params);
}
