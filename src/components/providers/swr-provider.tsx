"use client";

import { SWRConfig } from "swr";
import type { ReactNode } from "react";

// Global SWR defaults — individual hooks may override per endpoint.
// revalidateOnFocus: false  — no re-fetch when tab regains focus (causes flicker on mobile)
// revalidateOnReconnect: false — no re-fetch on reconnect (data hasn't changed)
// dedupingInterval: 10_000   — collapse identical requests within 10 s (default is 2 s)
// errorRetryCount: 2         — give up after 2 retries instead of the default 8
const SWR_CONFIG = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  dedupingInterval: 10_000,
  errorRetryCount: 2,
};

export function SWRProvider({ children }: { children: ReactNode }) {
  return <SWRConfig value={SWR_CONFIG}>{children}</SWRConfig>;
}
