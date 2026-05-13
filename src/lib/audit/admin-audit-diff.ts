export type FieldDiff<T> = { before: T; after: T };

export type DiffResult<T extends Record<string, unknown>> = {
  [K in keyof T]?: FieldDiff<T[K]>;
};

/** Returns a record of `{ before, after }` per key that changed. Keys
 * absent from `after` are skipped (treated as "not touched") rather
 * than reported as changes to `undefined`. Equality uses strict `===`
 * for primitives and JSON stringification for objects/arrays. */
export function buildAdminAuditDiff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): DiffResult<T> {
  const diff: DiffResult<T> = {};
  for (const key of Object.keys(after) as Array<keyof T>) {
    if (!Object.prototype.hasOwnProperty.call(after, key)) continue;
    const beforeVal = before[key];
    const afterVal = after[key] as T[typeof key];
    if (!isEqual(beforeVal, afterVal)) {
      diff[key] = { before: beforeVal, after: afterVal };
    }
  }
  return diff;
}

export function hasAnyDiff<T extends Record<string, unknown>>(diff: DiffResult<T>): boolean {
  return Object.keys(diff).length > 0;
}

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a === undefined || b === undefined) return false;
  const ta = typeof a;
  const tb = typeof b;
  if (ta !== tb) return false;
  if (ta === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}
