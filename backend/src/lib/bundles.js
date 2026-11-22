/**
 * Watch-party booking: fewest bundles that add up to exactly the group size.
 *
 * Written by hand (no solver libraries). This is the classic "minimum coin
 * change" problem solved with bottom-up dynamic programming:
 *
 *   best[0] = 0
 *   best[n] = 1 + min(best[n - size])   over every size <= n with best[n - size] reachable
 *
 * Time O(groupSize * sizes), memory O(groupSize). With the limits of this app
 * (10,000 seats, 10 sizes) that is at most 100,000 steps.
 */

const UNREACHABLE = 0x3fffffff;

/**
 * @param {number[]} bundleSizes distinct positive integers
 * @param {number} groupSize positive integer
 * @returns {{ totalBundles: number, bundles: { size: number, count: number }[] } | null}
 *   `bundles` is ordered from the largest size to the smallest and only lists
 *   sizes actually used. Returns null when no exact combination exists.
 */
export function minBundles(bundleSizes, groupSize) {
  // Largest first, and only a strictly better count replaces the current
  // choice, so ties are always broken in favour of bigger bundles. That makes
  // the answer deterministic.
  const sizes = [...bundleSizes].sort((a, b) => b - a);

  const best = new Int32Array(groupSize + 1).fill(UNREACHABLE);
  const lastSize = new Int32Array(groupSize + 1); // bundle used to reach each total
  best[0] = 0;

  for (let seats = 1; seats <= groupSize; seats++) {
    for (const size of sizes) {
      if (size > seats) continue;
      const candidate = best[seats - size] + 1;
      if (candidate < best[seats]) {
        best[seats] = candidate;
        lastSize[seats] = size;
      }
    }
  }

  if (best[groupSize] >= UNREACHABLE) return null;

  // Walk back through the choices to count how many of each size were used.
  const counts = new Map();
  for (let seats = groupSize; seats > 0; seats -= lastSize[seats]) {
    const size = lastSize[seats];
    counts.set(size, (counts.get(size) ?? 0) + 1);
  }

  const bundles = sizes
    .filter((size) => counts.has(size))
    .map((size) => ({ size, count: counts.get(size) }));

  return { totalBundles: best[groupSize], bundles };
}
