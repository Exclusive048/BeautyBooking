import { useEffect, useState } from "react";

/**
 * Returns `value` only after it has stayed unchanged for `delayMs`. Used by
 * the catalog autocomplete to throttle network requests while the user is
 * still typing — without this every keystroke would hit the database.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
