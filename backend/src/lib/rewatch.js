/**
 * Rewatch order: a topological ordering of everything a movie depends on.
 *
 * Written by hand (no graph / toposort libraries).
 */

/**
 * Return every movie that must be watched before `targetId` (its prerequisites,
 * their prerequisites, and so on), each exactly once, ordered so that every
 * movie comes after all of its own prerequisites. The target is not included.
 *
 * This is an iterative depth-first post-order walk: a movie is emitted only
 * after all of its prerequisites have been emitted. Prerequisites are visited
 * in the order they are stored, so the result is deterministic. For the sample
 * data it gives exactly: Iron Man, The First Avenger, The Avengers,
 * Civil War, Ragnarok, Infinity War, Endgame.
 *
 * @param {(id: number) => number[]} getPrereqs
 * @param {number} targetId
 * @returns {number[]} ids in watch order
 */
export function rewatchOrder(getPrereqs, targetId) {
  const VISITING = 1;
  const DONE = 2;
  const state = new Map();
  const order = [];

  state.set(targetId, VISITING);
  const stack = [{ id: targetId, next: 0, prereqs: getPrereqs(targetId) }];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];

    if (frame.next < frame.prereqs.length) {
      const prereqId = frame.prereqs[frame.next++];
      const seen = state.get(prereqId);

      if (seen === DONE) continue; // already placed earlier in the order
      if (seen === VISITING) {
        // Cannot happen while the API rejects cycles; guards against bad data.
        throw new Error(`Circular prerequisite chain detected at movie ${prereqId}`);
      }

      state.set(prereqId, VISITING);
      stack.push({ id: prereqId, next: 0, prereqs: getPrereqs(prereqId) });
    } else {
      state.set(frame.id, DONE);
      stack.pop();
      if (frame.id !== targetId) order.push(frame.id);
    }
  }

  return order;
}
