/** 200 -> "3h 20m", 45 -> "45m", 0 -> "0m" */
export function formatMinutes(total) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

/** Movies in release order, ties broken by title. Returns a new array. */
export function byRelease(movies) {
  return [...movies].sort((a, b) => a.releaseYear - b.releaseYear || a.title.localeCompare(b.title));
}
