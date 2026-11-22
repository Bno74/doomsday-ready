import fs from 'node:fs';
import path from 'node:path';

const emptyState = () => ({
  movies: [],
  cinemas: [],
  nextMovieId: 1,
  nextCinemaId: 1,
});

/**
 * A tiny persistent store.
 *
 * All data lives in memory and is mirrored to a single JSON file (when `file`
 * is given). Every change goes through `transaction`, which works on a copy of
 * the data and only commits it (to disk first, then to memory) if the whole
 * operation succeeded. That gives us two things for free:
 *   - batch creates are all-or-nothing, and
 *   - a rejected request can never leave half-applied changes behind.
 *
 * Node is single threaded and `transaction` is synchronous, so requests can
 * never interleave inside one.
 */
export class Store {
  /** @param {{ file?: string }} [options] omit `file` for a purely in-memory store (tests) */
  constructor({ file } = {}) {
    this.file = file;
    this.state = emptyState();
    if (file) this.#load();
  }

  /** Read-only view of the current data. Do not mutate it; use `transaction`. */
  read() {
    return this.state;
  }

  /**
   * Run `fn` against a draft copy of the data. If it returns normally the draft
   * is saved and becomes the current data; if it throws, nothing changes.
   */
  transaction(fn) {
    const draft = structuredClone(this.state);
    const result = fn(draft);
    this.#save(draft);
    this.state = draft;
    return result;
  }

  #load() {
    if (!fs.existsSync(this.file)) return;
    const raw = fs.readFileSync(this.file, 'utf8');
    if (raw.trim() === '') return;
    const parsed = JSON.parse(raw);
    this.state = { ...emptyState(), ...parsed };
  }

  #save(state) {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    // Write to a temp file then rename, so a crash mid-write cannot corrupt the data.
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
