import http from 'node:http';
import { createApp } from '../src/app.js';
import { Store } from '../src/store.js';
import { seedDemoData } from '../src/seed.js';

/**
 * Start the real app on a random port with an in-memory store.
 * Returns a tiny fetch wrapper and a `close` function.
 */
export async function startTestServer({ seed = false } = {}) {
  const store = new Store();
  if (seed) seedDemoData(store);

  const server = http.createServer(createApp(store));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function call(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  return {
    store,
    get: (path) => call('GET', path),
    post: (path, body) => call('POST', path, body),
    patch: (path, body) => call('PATCH', path, body),
    raw: (path, init) => fetch(base + path, init),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** Deterministic pseudo-random numbers so "random" tests are reproducible. */
export function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
