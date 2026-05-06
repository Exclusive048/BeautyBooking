// mulberry32 — small, fast PRNG with a 32-bit seed. Each seed module derives
// its own RNG from a stable string key so every `npm run seed:test` produces
// the same fixtures: same masters, same booking offsets, same favorites.
// That means bug reports referencing "Anna Kravtsova booking last Tuesday"
// stay reproducible across runs.

function hashStringToSeed(key: string): number {
  let hash = 1779033703 ^ key.length;
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return hash >>> 0;
}

export type Rng = {
  /** Next float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Pick a random element. Throws on empty arrays. */
  pick<T>(items: ReadonlyArray<T>): T;
  /** Fisher-Yates shuffle copy. */
  shuffle<T>(items: ReadonlyArray<T>): T[];
  /** True with the given probability (0..1). */
  chance(probability: number): boolean;
};

export function createRng(key: string): Rng {
  let state = hashStringToSeed(key);
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    pick(items) {
      if (items.length === 0) throw new Error("Rng.pick: empty array");
      return items[Math.floor(next() * items.length)]!;
    },
    shuffle(items) {
      const copy = items.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy;
    },
    chance(probability) {
      return next() < probability;
    },
  };
}
