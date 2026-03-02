import { headers } from "next/headers";

export function getNonce(): string {
  return headers().get("x-nonce") ?? "";
}
