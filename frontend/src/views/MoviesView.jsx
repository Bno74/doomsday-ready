import { useState } from 'react';
import { api } from '../api.js';
import { byRelease, formatMinutes } from '../format.js';
import PrerequisitePicker from '../components/PrerequisitePicker.jsx';

const emptyForm = { title: '', releaseYear: '', runtime: '', prerequisites: [], watched: false };

function AddMovieForm({ movies, onCreated }) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.createMovie({
        title: form.title,
        releaseYear: Number(form.releaseYear),
        runtime: Number(form.runtime),
        prerequisites: form.prerequisites,
        watched: form.watched,
      });
      setForm(emptyForm);
      await onCreated();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Add a movie</h2>
      <div className="grid-3">
        <label className="field wide">
          <span>Title</span>
          <input
            value={form.title}
            onChange={(e) => set('title')(e.target.value)}
            required
            maxLength={200}
            placeholder="e.g. Doctor Strange"
          />
        </label>
        <label className="field">
          <span>Release year</span>
          <input
            type="number"
            value={form.releaseYear}
            onChange={(e) => set('releaseYear')(e.target.value)}
            required
            min={1888}
            max={2100}
            step={1}
            placeholder="2016"
          />
        </label>
        <label className="field">
          <span>Runtime (minutes)</span>
          <input
            type="number"
            value={form.runtime}
            onChange={(e) => set('runtime')(e.target.value)}
            required
            min={1}
            max={300}
            step={1}
            placeholder="115"
          />
        </label>
      </div>

      <fieldset className="field">
        <legend>Watch these first (optional)</legend>
        <PrerequisitePicker
          movies={movies}
          selected={form.prerequisites}
          onChange={set('prerequisites')}
          idPrefix="new-prereq"
        />
      </fieldset>

      <label className="check">
        <input type="checkbox" checked={form.watched} onChange={(e) => set('watched')(e.target.checked)} />
        <span>Already watched</span>
      </label>

      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
      <div>
        <button className="btn primary" disabled={busy}>
          {busy ? 'Adding…' : 'Add movie'}
        </button>
      </div>
    </form>
  );
}

function MovieCard({ movie, movies, titleById, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(movie.prerequisites);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run(changes, after) {
    setError(null);
    setBusy(true);
    try {
      await api.updateMovie(movie.id, changes);
      await onChanged();
      after?.();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const startEditing = () => {
    setSelected(movie.prerequisites);
    setError(null);
    setEditing(true);
  };

  return (
    <li className={movie.watched ? 'movie watched' : 'movie'}>
      <div className="movie-main">
        <label className="check big">
          <input
            type="checkbox"
            checked={movie.watched}
            disabled={busy}
            onChange={(e) => run({ watched: e.target.checked })}
            aria-label={`Mark ${movie.title} as watched`}
          />
          <span className="movie-title">{movie.title}</span>
        </label>
        <div className="meta">
          <span>{movie.releaseYear}</span>
          <span>{formatMinutes(movie.runtime)}</span>
        </div>
        <div className="chips">
          {movie.prerequisites.length === 0 ? (
            <span className="muted small">No prerequisites</span>
          ) : (
            <>
              <span className="muted small">Watch first:</span>
              {movie.prerequisites.map((id) => (
                <span key={id} className="chip">
                  {titleById.get(id) ?? `#${id}`}
                </span>
              ))}
            </>
          )}
        </div>
      </div>

      {!editing && (
        <button className="btn small" onClick={startEditing}>
          Edit prerequisites
        </button>
      )}

      {editing && (
        <div className="editor">
          <PrerequisitePicker
            movies={movies}
            selected={selected}
            onChange={setSelected}
            excludeId={movie.id}
            idPrefix={`edit-${movie.id}`}
          />
          <div className="row">
            <button
              className="btn primary small"
              disabled={busy}
              onClick={() => run({ prerequisites: selected }, () => setEditing(false))}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              className="btn small"
              disabled={busy}
              onClick={() => {
                setError(null);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
    </li>
  );
}

function formatApiError(err) {
  return err.status && err.code ? `${err.status} ${err.code}` : err.message;
}

export default function MoviesView({ movies, onChanged }) {
  const titleById = new Map(movies.map((m) => [m.id, m.title]));
  const watchedCount = movies.filter((m) => m.watched).length;

  return (
    <div className="stack">
      <AddMovieForm movies={movies} onCreated={onChanged} />

      <section>
        <div className="section-head">
          <h2>Your movies</h2>
          {movies.length > 0 && (
            <span className="muted">
              {watchedCount} of {movies.length} watched
            </span>
          )}
        </div>
        {movies.length === 0 ? (
          <p className="card muted">No movies yet. Add the first one above.</p>
        ) : (
          <ul className="movie-list">
            {byRelease(movies).map((movie) => (
              <MovieCard
                key={movie.id}
                movie={movie}
                movies={movies}
                titleById={titleById}
                onChanged={onChanged}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
