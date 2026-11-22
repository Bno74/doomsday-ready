import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startTestServer } from './helpers.js';
import { Store } from '../src/store.js';
import { seedDemoData } from '../src/seed.js';

/** Ids assigned by the seed data. */
const M = {
  ironMan: 1,
  firstAvenger: 2,
  avengers: 3,
  civilWar: 4,
  ragnarok: 5,
  infinityWar: 6,
  endgame: 7,
  doomsday: 8,
};
const titles = (list) => list.map((m) => m.title);

describe('movies and rewatch order (brief examples)', () => {
  let api;
  before(async () => {
    api = await startTestServer({ seed: true });
  });
  after(() => api.close());

  test('Avengers: Doomsday needs all 7 other movies in a valid order', async () => {
    const { status, body } = await api.get(`/movies/${M.doomsday}/rewatch-order`);
    assert.equal(status, 200);
    assert.deepEqual(titles(body.order), [
      'Iron Man',
      'Captain America: The First Avenger',
      'The Avengers',
      'Captain America: Civil War',
      'Thor: Ragnarok',
      'Avengers: Infinity War',
      'Avengers: Endgame',
    ]);
    assert.equal(body.totalCount, 7);
    assert.equal(body.watchedCount, 0);
    assert.equal(body.remainingMinutes, 126 + 124 + 143 + 147 + 130 + 149 + 181);
    assert.deepEqual(body.movie, { id: M.doomsday, title: 'Avengers: Doomsday' });
  });

  test('Civil War: Iron Man and The First Avenger, then The Avengers', async () => {
    const { body } = await api.get(`/movies/${M.civilWar}/rewatch-order`);
    assert.deepEqual(new Set(titles(body.order).slice(0, 2)), new Set(['Iron Man', 'Captain America: The First Avenger']));
    assert.equal(titles(body.order)[2], 'The Avengers');
    assert.equal(body.order.length, 3);
  });

  test('Thor: Ragnarok has an empty rewatch list', async () => {
    const { status, body } = await api.get(`/movies/${M.ragnarok}/rewatch-order`);
    assert.equal(status, 200);
    assert.deepEqual(body.order, []);
    assert.equal(body.totalCount, 0);
    assert.equal(body.watchedCount, 0);
    assert.equal(body.remainingMinutes, 0);
  });

  test('Making Endgame a prerequisite of Iron Man is rejected with 409 CIRCULAR_DEPENDENCY', async () => {
    const { status, body } = await api.patch(`/movies/${M.ironMan}`, { prerequisites: [M.endgame] });
    assert.equal(status, 409);
    assert.equal(body.error.code, 'CIRCULAR_DEPENDENCY');
    // ...and nothing was changed.
    const after = await api.get(`/movies/${M.ironMan}`);
    assert.deepEqual(after.body.prerequisites, []);
  });
});

describe('movies API', () => {
  let api;
  beforeEach(async () => {
    api = await startTestServer();
  });
  const make = async (data) => {
    const res = await api.post('/movies', { releaseYear: 2000, runtime: 100, ...data });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body;
  };

  test('create applies defaults and returns the stored movie', async (t) => {
    t.after(() => api.close());
    const res = await api.post('/movies', { title: '  Iron Man ', releaseYear: 2008, runtime: 126 });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body, {
      id: 1,
      title: 'Iron Man',
      releaseYear: 2008,
      runtime: 126,
      prerequisites: [],
      watched: false,
    });
    const list = await api.get('/movies');
    assert.equal(list.body.length, 1);
  });

  test('create with prerequisites and watched', async (t) => {
    t.after(() => api.close());
    const a = await make({ title: 'A' });
    const b = await make({ title: 'B', prerequisites: [a.id, a.id], watched: true });
    assert.deepEqual(b.prerequisites, [a.id]);
    assert.equal(b.watched, true);
  });

  test('can create several movies in one request, all or nothing', async (t) => {
    t.after(() => api.close());
    const ok = await api.post('/movies', [
      { title: 'One', releaseYear: 2001, runtime: 90 },
      { title: 'Two', releaseYear: 2002, runtime: 91, prerequisites: [1] },
    ]);
    assert.equal(ok.status, 201);
    assert.equal(ok.body.length, 2);

    const bad = await api.post('/movies', [
      { title: 'Three', releaseYear: 2003, runtime: 92 },
      { title: 'Four', releaseYear: 2004, runtime: 0 },
    ]);
    assert.equal(bad.status, 400);
    assert.match(bad.body.error.message, /Item 1/);
    const list = await api.get('/movies');
    assert.equal(list.body.length, 2, 'the valid item of a failed batch was not saved');
  });

  test('title must be unique (case-insensitive) on create and update', async (t) => {
    t.after(() => api.close());
    const a = await make({ title: 'Thor' });
    const b = await make({ title: 'Loki' });
    const dup = await api.post('/movies', { title: 'THOR', releaseYear: 2011, runtime: 114 });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'DUPLICATE_TITLE');

    const rename = await api.patch(`/movies/${b.id}`, { title: ' thor ' });
    assert.equal(rename.status, 409);
    // Renaming a movie to its own title (or changing its case) is fine.
    const same = await api.patch(`/movies/${a.id}`, { title: 'THOR' });
    assert.equal(same.status, 200);
    assert.equal(same.body.title, 'THOR');
  });

  test('validation: runtime 1-300, whole numbers, types, required fields', async (t) => {
    t.after(() => api.close());
    const bad = [
      { title: 'x', releaseYear: 2000, runtime: 0 },
      { title: 'x', releaseYear: 2000, runtime: 301 },
      { title: 'x', releaseYear: 2000, runtime: 99.5 },
      { title: 'x', releaseYear: 2000, runtime: '100' },
      { title: 'x', releaseYear: 'abc', runtime: 100 },
      { title: 'x', releaseYear: 1700, runtime: 100 },
      { title: '', releaseYear: 2000, runtime: 100 },
      { title: '   ', releaseYear: 2000, runtime: 100 },
      { title: 5, releaseYear: 2000, runtime: 100 },
      { releaseYear: 2000, runtime: 100 },
      { title: 'x', runtime: 100 },
      { title: 'x', releaseYear: 2000 },
      { title: 'x', releaseYear: 2000, runtime: 100, watched: 'yes' },
      { title: 'x', releaseYear: 2000, runtime: 100, prerequisites: 'nope' },
      { title: 'x', releaseYear: 2000, runtime: 100, prerequisites: [1.5] },
    ];
    for (const payload of bad) {
      const res = await api.post('/movies', payload);
      assert.equal(res.status, 400, JSON.stringify(payload));
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
    // Boundaries are accepted.
    assert.equal((await api.post('/movies', { title: 'min', releaseYear: 2000, runtime: 1 })).status, 201);
    assert.equal((await api.post('/movies', { title: 'max', releaseYear: 2000, runtime: 300 })).status, 201);
  });

  test('unknown prerequisite ids are rejected', async (t) => {
    t.after(() => api.close());
    const res = await api.post('/movies', { title: 'x', releaseYear: 2000, runtime: 100, prerequisites: [99] });
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /99/);
    const a = await make({ title: 'A' });
    const patch = await api.patch(`/movies/${a.id}`, { prerequisites: [99] });
    assert.equal(patch.status, 400);
  });

  test('malformed JSON and bad bodies give clean 400s', async (t) => {
    t.after(() => api.close());
    const res = await api.raw('/movies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'INVALID_JSON');
    assert.equal((await api.post('/movies', 'just a string')).status, 400);
    assert.equal((await api.post('/movies', [])).status, 400);
    assert.equal((await api.post('/movies')).status, 400);
  });

  test('PATCH updates watched, fields and prerequisites; empty PATCH is rejected', async (t) => {
    t.after(() => api.close());
    const a = await make({ title: 'A' });
    const b = await make({ title: 'B' });

    const watched = await api.patch(`/movies/${a.id}`, { watched: true });
    assert.equal(watched.status, 200);
    assert.equal(watched.body.watched, true);

    const edited = await api.patch(`/movies/${b.id}`, {
      title: 'B2',
      runtime: 120,
      releaseYear: 2010,
      prerequisites: [a.id],
    });
    assert.equal(edited.status, 200);
    assert.deepEqual(edited.body, { id: b.id, title: 'B2', runtime: 120, releaseYear: 2010, prerequisites: [a.id], watched: false });

    const cleared = await api.patch(`/movies/${b.id}`, { prerequisites: [] });
    assert.deepEqual(cleared.body.prerequisites, []);

    assert.equal((await api.patch(`/movies/${b.id}`, {})).status, 400);
    assert.equal((await api.patch(`/movies/${b.id}`, { runtime: 500 })).status, 400);
  });

  test('unknown ids and routes give 404 in the standard error shape', async (t) => {
    t.after(() => api.close());
    for (const path of ['/movies/999', '/movies/abc', '/movies/0', '/movies/-1', '/movies/999/rewatch-order', '/nope']) {
      const res = await api.get(path);
      assert.equal(res.status, 404, path);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    }
    assert.equal((await api.patch('/movies/999', { watched: true })).status, 404);
  });

  test('a movie can never depend on itself', async (t) => {
    t.after(() => api.close());
    const a = await make({ title: 'A' });
    const res = await api.patch(`/movies/${a.id}`, { prerequisites: [a.id] });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CIRCULAR_DEPENDENCY');
  });

  test('indirect cycles are rejected, whatever the chain length', async (t) => {
    t.after(() => api.close());
    const a = await make({ title: 'A' });
    const b = await make({ title: 'B', prerequisites: [a.id] });
    const c = await make({ title: 'C', prerequisites: [b.id] });
    const d = await make({ title: 'D', prerequisites: [c.id] });

    const direct = await api.patch(`/movies/${a.id}`, { prerequisites: [b.id] });
    assert.equal(direct.status, 409);
    const indirect = await api.patch(`/movies/${a.id}`, { prerequisites: [d.id] });
    assert.equal(indirect.status, 409);
    assert.equal(indirect.body.error.code, 'CIRCULAR_DEPENDENCY');
    assert.match(indirect.body.error.message, /A → D → C → B → A/);
    // One bad entry among good ones still rejects the whole update.
    const mixed = await api.patch(`/movies/${b.id}`, { prerequisites: [a.id, d.id] });
    assert.equal(mixed.status, 409);

    // Nothing changed.
    const list = await api.get('/movies');
    assert.deepEqual(list.body.find((m) => m.id === a.id).prerequisites, []);
    assert.deepEqual(list.body.find((m) => m.id === b.id).prerequisites, [a.id]);
  });

  test('breaking the chain first makes the same edit legal', async (t) => {
    t.after(() => api.close());
    const a = await make({ title: 'A' });
    const b = await make({ title: 'B', prerequisites: [a.id] });
    assert.equal((await api.patch(`/movies/${a.id}`, { prerequisites: [b.id] })).status, 409);
    assert.equal((await api.patch(`/movies/${b.id}`, { prerequisites: [] })).status, 200);
    assert.equal((await api.patch(`/movies/${a.id}`, { prerequisites: [b.id] })).status, 200);
    // Swapping a prerequisite for another one in a single request works too.
    const c = await make({ title: 'C' });
    assert.equal((await api.patch(`/movies/${a.id}`, { prerequisites: [c.id] })).status, 200);
  });

  test('rewatch order reflects watched flags: counts and remaining minutes', async (t) => {
    t.after(() => api.close());
    const a = await make({ title: 'A', runtime: 100 });
    const b = await make({ title: 'B', runtime: 110, prerequisites: [a.id] });
    const c = await make({ title: 'C', runtime: 120, prerequisites: [b.id] });
    const target = await make({ title: 'Target', runtime: 130, prerequisites: [c.id, a.id] });

    await api.patch(`/movies/${a.id}`, { watched: true });
    const { body } = await api.get(`/movies/${target.id}/rewatch-order`);
    assert.deepEqual(titles(body.order), ['A', 'B', 'C']);
    assert.deepEqual(body.order.map((m) => m.watched), [true, false, false]);
    assert.equal(body.totalCount, 3);
    assert.equal(body.watchedCount, 1);
    assert.equal(body.remainingMinutes, 110 + 120); // target itself is not counted

    await api.patch(`/movies/${b.id}`, { watched: true });
    await api.patch(`/movies/${c.id}`, { watched: true });
    const done = (await api.get(`/movies/${target.id}/rewatch-order`)).body;
    assert.equal(done.watchedCount, 3);
    assert.equal(done.remainingMinutes, 0);
  });

  test('a movie shared by two paths appears exactly once', async (t) => {
    t.after(() => api.close());
    const base = await make({ title: 'Base' });
    const left = await make({ title: 'Left', prerequisites: [base.id] });
    const right = await make({ title: 'Right', prerequisites: [base.id] });
    const top = await make({ title: 'Top', prerequisites: [left.id, right.id] });
    const { body } = await api.get(`/movies/${top.id}/rewatch-order`);
    assert.deepEqual(titles(body.order), ['Base', 'Left', 'Right']);
  });
});

describe('cinemas and booking (brief examples)', () => {
  let api;
  before(async () => {
    api = await startTestServer({ seed: true });
  });
  after(() => api.close());

  const quote = async (cinemaId, groupSize) => (await api.get(`/cinemas/${cinemaId}/booking?groupSize=${groupSize}`)).body;
  const asPairs = (q) => q.bundles.map((b) => [b.size, b.count]);

  test('sizes 1, 3, 4 for 6 people: 2 bundles, 3 x 2', async () => {
    const q = await quote(1, 6);
    assert.equal(q.possible, true);
    assert.equal(q.totalBundles, 2);
    assert.deepEqual(asPairs(q), [[3, 2]]);
  });

  test('sizes 2, 5 for 11 people: 4 bundles, 5 x 1 and 2 x 3', async () => {
    const q = await quote(2, 11);
    assert.equal(q.totalBundles, 4);
    assert.deepEqual(asPairs(q), [[5, 1], [2, 3]]);
  });

  test('sizes 6, 9, 20 for 44 people: 4 bundles, 20 x 1, 9 x 2, 6 x 1', async () => {
    const q = await quote(3, 44);
    assert.equal(q.totalBundles, 4);
    assert.deepEqual(asPairs(q), [[20, 1], [9, 2], [6, 1]]);
  });

  test('sizes 4, 6 for 7 people: not possible', async () => {
    const res = await api.get('/cinemas/4/booking?groupSize=7');
    assert.equal(res.status, 200);
    assert.equal(res.body.possible, false);
    assert.equal(res.body.totalBundles, null);
    assert.deepEqual(res.body.bundles, []);
    assert.match(res.body.message, /No exact combination/);
    assert.equal(res.body.groupSize, 7);
  });

  test('group size limits: 1 and 10000 are fine, everything else is a 400', async () => {
    assert.equal((await api.get('/cinemas/1/booking?groupSize=1')).body.totalBundles, 1);
    assert.equal((await api.get('/cinemas/1/booking?groupSize=10000')).status, 200);
    for (const bad of ['0', '10001', '-5', '2.5', 'abc', '', '1e3', '%20']) {
      const res = await api.get(`/cinemas/1/booking?groupSize=${bad}`);
      assert.equal(res.status, 400, `groupSize=${bad}`);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
    assert.equal((await api.get('/cinemas/1/booking')).status, 400);
    assert.equal((await api.get('/cinemas/1/booking?groupSize=3&groupSize=4')).status, 400);
  });

  test('unknown cinema is a 404', async () => {
    assert.equal((await api.get('/cinemas/99/booking?groupSize=4')).status, 404);
    assert.equal((await api.get('/cinemas/x/booking?groupSize=4')).status, 404);
  });
});

describe('cinemas API', () => {
  test('create, list, uniqueness and validation', async (t) => {
    const api = await startTestServer();
    t.after(() => api.close());

    const created = await api.post('/cinemas', { name: ' Odeon ', bundleSizes: [5, 2, 5] });
    assert.equal(created.status, 201);
    assert.deepEqual(created.body, { id: 1, name: 'Odeon', bundleSizes: [2, 5] });
    assert.deepEqual((await api.get('/cinemas')).body, [created.body]);
    assert.deepEqual((await api.get('/cinemas/1')).body, created.body);

    const dup = await api.post('/cinemas', { name: 'ODEON', bundleSizes: [3] });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'DUPLICATE_NAME');

    const tenSizes = Array.from({ length: 10 }, (_, i) => i + 1);
    assert.equal((await api.post('/cinemas', { name: 'Ten', bundleSizes: tenSizes })).status, 201);
    assert.equal((await api.post('/cinemas', { name: 'Eleven', bundleSizes: [...tenSizes, 11] })).status, 400);
    assert.equal((await api.post('/cinemas', { name: 'Edges', bundleSizes: [1, 500] })).status, 201);

    const bad = [
      { bundleSizes: [1] },
      { name: 'x' },
      { name: '', bundleSizes: [1] },
      { name: 'x', bundleSizes: [] },
      { name: 'x', bundleSizes: [0] },
      { name: 'x', bundleSizes: [501] },
      { name: 'x', bundleSizes: [1.5] },
      { name: 'x', bundleSizes: ['3'] },
      { name: 'x', bundleSizes: 3 },
      { name: 7, bundleSizes: [1] },
    ];
    for (const payload of bad) {
      const res = await api.post('/cinemas', payload);
      assert.equal(res.status, 400, JSON.stringify(payload));
    }
  });

  test('can create several cinemas in one request', async (t) => {
    const api = await startTestServer();
    t.after(() => api.close());
    const res = await api.post('/cinemas', [
      { name: 'A', bundleSizes: [1] },
      { name: 'B', bundleSizes: [2] },
    ]);
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.map((c) => c.id), [1, 2]);
  });
});

describe('persistence', () => {
  test('data survives a restart and ids keep counting up', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doomsday-'));
    const file = path.join(dir, 'nested', 'db.json');
    try {
      const first = new Store({ file });
      assert.equal(seedDemoData(first), true);

      const second = new Store({ file });
      assert.equal(second.read().movies.length, 8);
      assert.equal(second.read().cinemas.length, 4);
      assert.equal(seedDemoData(second), false, 'seeding never overwrites existing data');

      second.transaction((draft) => {
        draft.movies.push({ id: draft.nextMovieId++, title: 'New', releaseYear: 2030, runtime: 90, prerequisites: [], watched: false });
      });
      assert.equal(new Store({ file }).read().movies.at(-1).id, 9);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a failed transaction changes nothing', () => {
    const store = new Store();
    store.transaction((d) => d.movies.push({ id: 1 }));
    assert.throws(() =>
      store.transaction((d) => {
        d.movies.push({ id: 2 });
        throw new Error('boom');
      }),
    );
    assert.equal(store.read().movies.length, 1);
  });
});
