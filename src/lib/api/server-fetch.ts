import { headers } from "next/headers";
import type { ApiResponse } from "@/lib/types/api";

async function buildAbsoluteUrl(path: string): Promise<string> {
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  if (!host) return path;
  return `${proto}://${host}${path}`;
}

export async function serverApiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<ApiResponse<T>> {
  const hdrs = await headers();
  const cookie = hdrs.get("cookie");
  const url = await buildAbsoluteUrl(path);

  const requestHeaders = new Headers(init?.headers);
  if (cookie) requestHeaders.set("cookie", cookie);

  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: requestHeaders,
  });

  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;

  if (!res.ok) {
    return { ok: false, error: { message: `API error: ${res.status}` } };
  }

  if (!json) {
    return { ok: false, error: { message: "Invalid API response" } };
  }

  return json;
}
