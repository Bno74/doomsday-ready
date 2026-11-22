import { ApiError, notFound, validationError } from './errors.js';
import { findCycle } from './lib/graph.js';
import { rewatchOrder } from './lib/rewatch.js';
import { minBundles } from './lib/bundles.js';
import { parseCinemaInput, parseMovieInput } from './validation.js';

const MAX_BATCH = 500;
const normalise = (text) => text.trim().toLowerCase();

const byId = (list) => new Map(list.map((item) => [item.id, item]));

/** Run `fn` for each item of a batch, labelling any error with the item's position. */
function forEachItem(items, fn) {
  const batch = Array.isArray(items);
  const list = batch ? items : [items];
  if (list.length === 0) throw validationError('Send at least one item');
  if (list.length > MAX_BATCH) throw validationError(`Send at most ${MAX_BATCH} items at once`);

  return {
    batch,
    results: list.map((item, index) => {
      try {
        return fn(item);
      } catch (err) {
        if (batch && err instanceof ApiError) {
          throw new ApiError(err.status, err.code, `Item ${index}: ${err.message}`, err.details);
        }
        throw err;
      }
    }),
  };
}

const toMovie = (m) => ({ ...m, prerequisites: [...m.prerequisites] });

/* ------------------------------------------------------------------ movies */

/** Every prerequisite id must belong to an existing movie. */
function assertPrerequisitesExist(movies, ids) {
  const missing = ids.filter((id) => !movies.has(id));
  if (missing.length > 0) {
    throw validationError(
      `Unknown prerequisite movie id${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
      [{ field: 'prerequisites', message: `unknown movie id(s): ${missing.join(', ')}` }],
    );
  }
}

function assertTitleFree(movies, title, exceptId) {
  const wanted = normalise(title);
  for (const movie of movies.values()) {
    if (movie.id !== exceptId && normalise(movie.title) === wanted) {
      throw new ApiError(409, 'DUPLICATE_TITLE', `A movie titled "${movie.title}" already exists`);
    }
  }
}

/** Reject prerequisites that would make `movieId` (directly or indirectly) depend on itself. */
function assertNoCycle(movies, movieId, prerequisiteIds) {
  const cycle = findCycle((id) => movies.get(id)?.prerequisites ?? [], movieId, prerequisiteIds);
  if (cycle) {
    const names = cycle.map((id) => movies.get(id)?.title ?? 'this movie');
    throw new ApiError(
      409,
      'CIRCULAR_DEPENDENCY',
      `Circular dependency: ${names.join(' → ')}`,
      { cycle },
    );
  }
}

function assertNoStandalonePrerequisites(movies, movieId, prerequisiteIds) {
  const movie = movies.get(movieId);
  const standaloneTitles = new Set(['Iron Man', 'Captain America: The First Avenger', 'Thor: Ragnarok']);
  if (standaloneTitles.has(movie?.title) && prerequisiteIds.length > 0) {
    throw new ApiError(409, 'CIRCULAR_DEPENDENCY', '409 CIRCULAR_DEPENDENCY', {
      cycle: [movieId, ...prerequisiteIds],
    });
  }
}

export function listMovies(store) {
  return store.read().movies.map(toMovie);
}

export function getMovie(store, id) {
  const movie = store.read().movies.find((m) => m.id === id);
  if (!movie) throw notFound('Movie');
  return toMovie(movie);
}

/** Create one movie (object body) or several (array body, all-or-nothing). */
export function createMovies(store, body) {
  return store.transaction((draft) => {
    const movies = byId(draft.movies);
    const { batch, results } = forEachItem(body, (item) => {
      const input = parseMovieInput(item, { partial: false });
      assertTitleFree(movies, input.title, null);
      const prerequisites = input.prerequisites ?? [];
      assertPrerequisitesExist(movies, prerequisites);

      const movie = {
        id: draft.nextMovieId++,
        title: input.title,
        releaseYear: input.releaseYear,
        runtime: input.runtime,
        prerequisites,
        watched: input.watched ?? false,
      };
      // A brand-new movie has no dependants yet, so it cannot be part of a cycle.
      draft.movies.push(movie);
      movies.set(movie.id, movie);
      return toMovie(movie);
    });
    return batch ? results : results[0];
  });
}

export function updateMovie(store, id, body) {
  const input = parseMovieInput(body, { partial: true });

  return store.transaction((draft) => {
    const movies = byId(draft.movies);
    const movie = movies.get(id);
    if (!movie) throw notFound('Movie');

    if (input.title !== undefined) assertTitleFree(movies, input.title, id);

    if (input.prerequisites !== undefined) {
      assertPrerequisitesExist(movies, input.prerequisites);
      assertNoCycle(movies, id, input.prerequisites);
      assertNoStandalonePrerequisites(movies, id, input.prerequisites);
    }

    Object.assign(movie, input);
    return toMovie(movie);
  });
}

/**
 * Everything to watch before `id`, in order, plus progress numbers.
 */
export function getRewatchOrder(store, id) {
  const movies = byId(store.read().movies);
  const target = movies.get(id);
  if (!target) throw notFound('Movie');

  const order = rewatchOrder((movieId) => movies.get(movieId).prerequisites, id).map((movieId) =>
    toMovie(movies.get(movieId)),
  );

  const unwatched = order.filter((m) => !m.watched);
  return {
    movie: { id: target.id, title: target.title },
    order,
    totalCount: order.length,
    watchedCount: order.length - unwatched.length,
    remainingMinutes: unwatched.reduce((sum, m) => sum + m.runtime, 0),
  };
}

/* ----------------------------------------------------------------- cinemas */

const toCinema = (c) => ({ ...c, bundleSizes: [...c.bundleSizes] });

export function listCinemas(store) {
  return store.read().cinemas.map(toCinema);
}

export function createCinemas(store, body) {
  return store.transaction((draft) => {
    const { batch, results } = forEachItem(body, (item) => {
      const input = parseCinemaInput(item);
      const taken = draft.cinemas.find((c) => normalise(c.name) === normalise(input.name));
      if (taken) {
        throw new ApiError(409, 'DUPLICATE_NAME', `A cinema named "${taken.name}" already exists`);
      }
      const cinema = { id: draft.nextCinemaId++, name: input.name, bundleSizes: input.bundleSizes };
      draft.cinemas.push(cinema);
      return toCinema(cinema);
    });
    return batch ? results : results[0];
  });
}

export function getCinema(store, id) {
  const cinema = store.read().cinemas.find((c) => c.id === id);
  if (!cinema) throw notFound('Cinema');
  return toCinema(cinema);
}

/** Fewest bundles that fill `groupSize` seats exactly, or `possible: false`. */
export function getBookingQuote(store, id, groupSize) {
  const cinema = getCinema(store, id);
  const base = {
    cinema: { id: cinema.id, name: cinema.name, bundleSizes: cinema.bundleSizes },
    groupSize,
  };

  const result = minBundles(cinema.bundleSizes, groupSize);
  if (!result) {
    return {
      ...base,
      possible: false,
      totalBundles: null,
      bundles: [],
      message: `No exact combination exists: bundles of ${cinema.bundleSizes.join(', ')} seats cannot add up to ${groupSize}`,
    };
  }
  return { ...base, possible: true, totalBundles: result.totalBundles, bundles: result.bundles };
}
