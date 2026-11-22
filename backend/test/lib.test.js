import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minBundles } from '../src/lib/bundles.js';
import { rewatchOrder } from '../src/lib/rewatch.js';
import { findCycle } from '../src/lib/graph.js';
import { mulberry32 } from './helpers.js';

/* ------------------------------------------------------------- bundles */

test('minBundles: examples from the brief', () => {
  assert.deepEqual(minBundles([1, 3, 4], 6), { totalBundles: 2, bundles: [{ size: 3, count: 2 }] });
  assert.deepEqual(minBundles([2, 5], 11), {
    totalBundles: 4,
    bundles: [
      { size: 5, count: 1 },
      { size: 2, count: 3 },
    ],
  });
  assert.deepEqual(minBundles([6, 9, 20], 44), {
    totalBundles: 4,
    bundles: [
      { size: 20, count: 1 },
      { size: 9, count: 2 },
      { size: 6, count: 1 },
    ],
  });
  assert.equal(minBundles([4, 6], 7), null);
});

test('minBundles: single size and exact multiples', () => {
  assert.deepEqual(minBundles([7], 7), { totalBundles: 1, bundles: [{ size: 7, count: 1 }] });
  assert.deepEqual(minBundles([7], 21), { totalBundles: 3, bundles: [{ size: 7, count: 3 }] });
  assert.equal(minBundles([7], 20), null);
  assert.deepEqual(minBundles([1], 5), { totalBundles: 5, bundles: [{ size: 1, count: 5 }] });
});

test('minBundles: greedy would be wrong here (needs real DP)', () => {
  // Greedy takes 4 first: 4+1+1 = 3 bundles. The optimum is 3+3 = 2 bundles.
  assert.equal(minBundles([1, 3, 4], 6).totalBundles, 2);
  // Greedy takes 25 first and gets stuck: 25+1*5 = 6 bundles. Optimum is 15+15 = 2.
  assert.equal(minBundles([1, 15, 25], 30).totalBundles, 2);
});

/** Exhaustive reference solution: breadth-first search over seat totals. */
function bruteForce(sizes, target) {
  let frontier = new Set([0]);
  for (let bundles = 0; frontier.size > 0; bundles++) {
    if (frontier.has(target)) return bundles;
    const next = new Set();
    for (const total of frontier) {
      for (const size of sizes) if (total + size <= target) next.add(total + size);
    }
    frontier = next;
  }
  return null;
}

test('minBundles: agrees with brute force on random cases and always sums exactly', () => {
  const rand = mulberry32(2027);
  for (let i = 0; i < 400; i++) {
    const count = 1 + Math.floor(rand() * 5);
    const sizes = [...new Set(Array.from({ length: count }, () => 1 + Math.floor(rand() * 12)))];
    const target = 1 + Math.floor(rand() * 60);

    const expected = bruteForce(sizes, target);
    const actual = minBundles(sizes, target);

    if (expected === null) {
      assert.equal(actual, null, `sizes=${sizes} target=${target}`);
      continue;
    }
    assert.equal(actual.totalBundles, expected, `sizes=${sizes} target=${target}`);
    const seats = actual.bundles.reduce((sum, b) => sum + b.size * b.count, 0);
    const bundles = actual.bundles.reduce((sum, b) => sum + b.count, 0);
    assert.equal(seats, target);
    assert.equal(bundles, actual.totalBundles);
    for (const b of actual.bundles) assert.ok(sizes.includes(b.size) && b.count > 0);
  }
});

test('minBundles: largest input is fast', () => {
  const started = performance.now();
  const result = minBundles([7, 13, 29, 101, 499, 500, 3, 11, 17, 250], 10_000);
  assert.ok(result);
  assert.ok(performance.now() - started < 500);
});

/* ------------------------------------------------------------- rewatch */

const graph = (edges) => (id) => edges[id] ?? [];

test('rewatchOrder: lists each prerequisite once, after its own prerequisites, excluding target', () => {
  // Diamond: 4 needs 2 and 3, both need 1.
  const order = rewatchOrder(graph({ 4: [2, 3], 2: [1], 3: [1] }), 4);
  assert.deepEqual(order, [1, 2, 3]);
});

test('rewatchOrder: movie with no prerequisites gives an empty list', () => {
  assert.deepEqual(rewatchOrder(graph({}), 1), []);
});

test('rewatchOrder: handles a very long chain without overflowing the stack', () => {
  const n = 50_000;
  const edges = {};
  for (let i = 2; i <= n; i++) edges[i] = [i - 1];
  const order = rewatchOrder(graph(edges), n);
  assert.equal(order.length, n - 1);
  assert.equal(order[0], 1);
  assert.equal(order.at(-1), n - 1);
});

test('rewatchOrder: random DAGs always give a valid, duplicate-free order', () => {
  const rand = mulberry32(42);
  for (let round = 0; round < 200; round++) {
    const n = 2 + Math.floor(rand() * 25);
    const edges = {};
    for (let id = 1; id <= n; id++) {
      // Only depend on lower ids, so the graph is acyclic by construction.
      edges[id] = [];
      for (let p = 1; p < id; p++) if (rand() < 0.25) edges[id].push(p);
    }
    const target = n;

    const order = rewatchOrder(graph(edges), target);

    // Expected set = everything reachable from the target.
    const reachable = new Set();
    const todo = [...edges[target]];
    while (todo.length) {
      const id = todo.pop();
      if (reachable.has(id)) continue;
      reachable.add(id);
      todo.push(...edges[id]);
    }

    assert.equal(new Set(order).size, order.length, 'no duplicates');
    assert.deepEqual(new Set(order), reachable, 'exactly the transitive prerequisites');
    assert.ok(!order.includes(target), 'excludes the target');
    const position = new Map(order.map((id, i) => [id, i]));
    for (const id of order) {
      for (const p of edges[id]) assert.ok(position.get(p) < position.get(id), `${p} before ${id}`);
    }
  }
});

/* --------------------------------------------------------------- cycles */

test('findCycle: self dependency', () => {
  assert.deepEqual(findCycle(graph({}), 1, [1]), [1, 1]);
});

test('findCycle: direct and indirect cycles, with the path reported', () => {
  const edges = { 2: [1], 3: [2], 4: [3] };
  // 1 requiring 4 would give 1 -> 4 -> 3 -> 2 -> 1
  assert.deepEqual(findCycle(graph(edges), 1, [4]), [1, 4, 3, 2, 1]);
  // 1 requiring 2 is a direct two-movie cycle
  assert.deepEqual(findCycle(graph(edges), 1, [2]), [1, 2, 1]);
});

test('findCycle: no cycle for valid edits, including ones that replace the old prerequisites', () => {
  const edges = { 2: [1], 3: [1], 4: [2, 3] };
  assert.equal(findCycle(graph(edges), 4, [1]), null);
  assert.equal(findCycle(graph(edges), 4, []), null);
  assert.equal(findCycle(graph(edges), 5, [4]), null);
  // Movie 2 currently needs 1. Replacing that with 3 is fine even though 1 would not be reachable.
  assert.equal(findCycle(graph(edges), 2, [3]), null);
  // But replacing it with 4 closes 2 -> 4 -> 2.
  assert.notEqual(findCycle(graph(edges), 2, [4]), null);
});
