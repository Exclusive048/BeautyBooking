"use client";

export function getViewerTimeZone(): string {
  try {
    if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
      const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (resolved && typeof resolved === "string") {
        return resolved;
      }
    }
  } catch {
    // Fall through to default.
  }
  return "Europe/Moscow";
}

export function useViewerTimeZone(): string {
  return getViewerTimeZone();
}
