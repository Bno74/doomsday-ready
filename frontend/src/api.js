// Same-origin by default (Vite proxy in dev, nginx in Docker). Override with VITE_API_URL if needed.
const BASE = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Is the API running?');
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // not JSON; handled below
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? 'ERROR',
      data?.error?.message ?? `Request failed (${res.status})`,
    );
  }
  return data;
}

export const api = {
  listMovies: () => request('/movies'),
  createMovie: (movie) => request('/movies', { method: 'POST', body: movie }),
  updateMovie: (id, changes) => request(`/movies/${id}`, { method: 'PATCH', body: changes }),
  rewatchOrder: (id) => request(`/movies/${id}/rewatch-order`),
  listCinemas: () => request('/cinemas'),
  createCinema: (cinema) => request('/cinemas', { method: 'POST', body: cinema }),
  booking: (id, groupSize) => request(`/cinemas/${id}/booking?groupSize=${encodeURIComponent(groupSize)}`),
};
