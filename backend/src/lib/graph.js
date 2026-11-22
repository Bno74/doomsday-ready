/**
 * Cycle detection for the movie prerequisite graph.
 *
 * Written by hand (no graph libraries). Edges point from a movie to the movies
 * that must be watched before it: `movie -> prerequisite`.
 */

/**
 * Would giving `movieId` the prerequisites `newPrereqIds` create a cycle?
 *
 * Adding the edges `movieId -> p` for every p in `newPrereqIds` closes a cycle
 * exactly when `movieId` is already reachable from one of those p by following
 * prerequisite edges (a prerequisite of a prerequisite, and so on). A direct
 * self-dependency is the shortest case: p === movieId.
 *
 * The movie's *current* prerequisites are deliberately never expanded, because
 * they are the ones being replaced. That is what makes updates that remove an
 * edge and add another one in the same request work correctly.
 *
 * Iterative DFS, so very long chains cannot overflow the call stack.
 *
 * @param {(id: number) => number[]} getPrereqs prerequisites of an existing movie ([] if unknown)
 * @param {number} movieId movie being created/updated (may not exist yet)
 * @param {number[]} newPrereqIds the prerequisites it is about to get
 * @returns {number[] | null} the cycle as ids `[movieId, ..., movieId]`, or null if there is none
 */
export function findCycle(getPrereqs, movieId, newPrereqIds) {
  const parent = new Map(); // node -> the node we came from while searching
  const stack = [];

  for (const start of newPrereqIds) {
    if (!parent.has(start)) {
      parent.set(start, movieId);
      stack.push(start);
    }
  }

  while (stack.length > 0) {
    const current = stack.pop();

    if (current === movieId) {
      // Walk the parent links back to the movie to rebuild the cycle.
      const path = [movieId];
      let node = parent.get(movieId);
      // parent.get(movieId) is the node that led to it; follow until we return.
      const reversed = [];
      while (node !== movieId) {
        reversed.push(node);
        node = parent.get(node);
      }
      path.push(...reversed.reverse(), movieId);
      return path;
    }

    for (const prereq of getPrereqs(current)) {
      if (!parent.has(prereq)) {
        parent.set(prereq, current);
        stack.push(prereq);
      }
    }
  }

  return null;
}
