import { validationError } from './errors.js';

export const LIMITS = {
  title: { min: 1, max: 200 },
  releaseYear: { min: 1888, max: 2100 }, // 1888 = first film ever shot; generous upper bound
  runtime: { min: 1, max: 300 }, // minutes, per the brief
  cinemaName: { min: 1, max: 100 },
  bundleSize: { min: 1, max: 500 }, // seats per bundle, per the brief
  bundleCount: { min: 1, max: 10 }, // different bundle sizes per cinema, per the brief
  groupSize: { min: 1, max: 10_000 }, // per the brief
};

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** First of `names` that is present on `body`, so a few friendly aliases are accepted. */
function pick(body, names) {
  for (const name of names) {
    if (body[name] !== undefined) return { name, value: body[name] };
  }
  return null;
}

const inRange = (n, { min, max }) => Number.isInteger(n) && n >= min && n <= max;

function fail(errors, summary = 'Invalid request') {
  const message = `${summary}: ${errors.map((e) => `${e.field} ${e.message}`).join('; ')}`;
  return validationError(message, errors);
}

/**
 * Validate a movie payload.
 *
 * @param {unknown} body
 * @param {{ partial: boolean }} options partial=true for PATCH (every field optional)
 * @returns {{ title?: string, releaseYear?: number, runtime?: number, prerequisites?: number[], watched?: boolean }}
 */
export function parseMovieInput(body, { partial }) {
  if (!isPlainObject(body)) {
    throw validationError('Request body must be a JSON object');
  }

  const errors = [];
  const out = {};

  const title = pick(body, ['title']);
  if (title) {
    if (typeof title.value !== 'string') {
      errors.push({ field: 'title', message: 'must be a string' });
    } else {
      const trimmed = title.value.trim();
      if (trimmed.length < LIMITS.title.min || trimmed.length > LIMITS.title.max) {
        errors.push({
          field: 'title',
          message: `must be between ${LIMITS.title.min} and ${LIMITS.title.max} characters`,
        });
      } else {
        out.title = trimmed;
      }
    }
  } else if (!partial) {
    errors.push({ field: 'title', message: 'is required' });
  }

  const year = pick(body, ['releaseYear', 'year']);
  if (year) {
    if (!inRange(year.value, LIMITS.releaseYear)) {
      errors.push({
        field: 'releaseYear',
        message: `must be a whole number between ${LIMITS.releaseYear.min} and ${LIMITS.releaseYear.max}`,
      });
    } else {
      out.releaseYear = year.value;
    }
  } else if (!partial) {
    errors.push({ field: 'releaseYear', message: 'is required' });
  }

  const runtime = pick(body, ['runtime', 'runtimeMinutes']);
  if (runtime) {
    if (!inRange(runtime.value, LIMITS.runtime)) {
      errors.push({
        field: 'runtime',
        message: `must be a whole number of minutes between ${LIMITS.runtime.min} and ${LIMITS.runtime.max}`,
      });
    } else {
      out.runtime = runtime.value;
    }
  } else if (!partial) {
    errors.push({ field: 'runtime', message: 'is required' });
  }

  const prereqs = pick(body, ['prerequisites', 'prerequisiteIds']);
  if (prereqs) {
    const list = prereqs.value;
    if (!Array.isArray(list) || !list.every((id) => Number.isInteger(id) && id > 0)) {
      errors.push({ field: 'prerequisites', message: 'must be an array of movie ids' });
    } else {
      out.prerequisites = [...new Set(list)]; // repeated ids are collapsed, order kept
    }
  }

  const watched = pick(body, ['watched']);
  if (watched) {
    if (typeof watched.value !== 'boolean') {
      errors.push({ field: 'watched', message: 'must be true or false' });
    } else {
      out.watched = watched.value;
    }
  }

  if (errors.length > 0) throw fail(errors, 'Invalid movie');

  if (partial && Object.keys(out).length === 0) {
    throw validationError(
      'Nothing to update: send at least one of title, releaseYear, runtime, prerequisites, watched',
    );
  }

  return out;
}

/**
 * Validate a cinema payload.
 * @returns {{ name: string, bundleSizes: number[] }} sizes de-duplicated and sorted ascending
 */
export function parseCinemaInput(body) {
  if (!isPlainObject(body)) {
    throw validationError('Request body must be a JSON object');
  }

  const errors = [];
  const out = {};

  if (body.name === undefined) {
    errors.push({ field: 'name', message: 'is required' });
  } else if (typeof body.name !== 'string') {
    errors.push({ field: 'name', message: 'must be a string' });
  } else {
    const trimmed = body.name.trim();
    if (trimmed.length < LIMITS.cinemaName.min || trimmed.length > LIMITS.cinemaName.max) {
      errors.push({
        field: 'name',
        message: `must be between ${LIMITS.cinemaName.min} and ${LIMITS.cinemaName.max} characters`,
      });
    } else {
      out.name = trimmed;
    }
  }

  const sizes = body.bundleSizes;
  if (sizes === undefined) {
    errors.push({ field: 'bundleSizes', message: 'is required' });
  } else if (!Array.isArray(sizes) || !sizes.every((s) => inRange(s, LIMITS.bundleSize))) {
    errors.push({
      field: 'bundleSizes',
      message: `must be an array of whole numbers between ${LIMITS.bundleSize.min} and ${LIMITS.bundleSize.max}`,
    });
  } else {
    const distinct = [...new Set(sizes)].sort((a, b) => a - b);
    if (distinct.length < LIMITS.bundleCount.min || distinct.length > LIMITS.bundleCount.max) {
      errors.push({
        field: 'bundleSizes',
        message: `must contain between ${LIMITS.bundleCount.min} and ${LIMITS.bundleCount.max} different sizes`,
      });
    } else {
      out.bundleSizes = distinct;
    }
  }

  if (errors.length > 0) throw fail(errors, 'Invalid cinema');
  return out;
}

/** Validate the `groupSize` query parameter of the booking endpoint. */
export function parseGroupSize(raw) {
  const valid =
    typeof raw === 'string' &&
    /^\d{1,6}$/.test(raw.trim()) &&
    inRange(Number(raw), LIMITS.groupSize);
  if (!valid) {
    throw validationError(
      `groupSize must be a whole number between ${LIMITS.groupSize.min} and ${LIMITS.groupSize.max}`,
      [{ field: 'groupSize', message: 'is missing or out of range' }],
    );
  }
  return Number(raw);
}

/** Parse an id from a URL path. Anything that is not a positive integer cannot exist. */
export function parseId(raw) {
  return typeof raw === 'string' && /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : null;
}
