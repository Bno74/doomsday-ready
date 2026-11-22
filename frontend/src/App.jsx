import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { byRelease } from './format.js';
import MoviesView from './views/MoviesView.jsx';
import RewatchView from './views/RewatchView.jsx';
import BookingView from './views/BookingView.jsx';

/** One frame per movie in release order; watched movies light up. */
function FilmStrip({ movies }) {
  if (movies.length === 0) return null;
  const sorted = byRelease(movies);
  const watched = sorted.filter((m) => m.watched).length;
  return (
    <div className="strip" role="img" aria-label={`${watched} of ${sorted.length} movies watched`}>
      {sorted.map((m, i) => (
        <span
          key={m.id}
          className={m.watched ? 'frame lit' : 'frame'}
          style={{ '--i': i }}
          title={`${m.title} (${m.releaseYear})`}
        />
      ))}
    </div>
  );
}

const TABS = [
  { id: 'movies', label: 'Movies' },
  { id: 'rewatch', label: 'Rewatch Plan' },
  { id: 'booking', label: 'Booking' },
];

export default function App() {
  const [tab, setTab] = useState(() => {
    const saved = window.localStorage.getItem('doomsday-active-tab');
    return TABS.some((item) => item.id === saved) ? saved : 'movies';
  });
  const [movies, setMovies] = useState([]);
  const [cinemas, setCinemas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const refreshMovies = useCallback(async () => {
    setMovies(await api.listMovies());
  }, []);

  const refreshCinemas = useCallback(async () => {
    setCinemas(await api.listCinemas());
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      await Promise.all([refreshMovies(), refreshCinemas()]);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [refreshMovies, refreshCinemas]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    window.localStorage.setItem('doomsday-active-tab', tab);
  }, [tab]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Doomsday Ready</h1>
          <p>Catch up on the MCU, then book opening night.</p>
        </div>
        {!loading && !loadError && <FilmStrip movies={movies} />}
        <nav className="tabs" role="tablist" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="panel"
              className={tab === t.id ? 'tab active' : 'tab'}
              onClick={() => {
                setTab(t.id);
                window.localStorage.setItem('doomsday-active-tab', t.id);
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {loading && <p className="muted">Loading…</p>}
        {loadError && (
          <div className="banner error" role="alert">
            <span>{loadError}</span>
            <button className="btn small" onClick={loadAll}>
              Retry
            </button>
          </div>
        )}
        {!loading && !loadError && tab === 'movies' && (
          <MoviesView movies={movies} onChanged={refreshMovies} />
        )}
        {!loading && !loadError && tab === 'rewatch' && <RewatchView movies={movies} />}
        {!loading && !loadError && tab === 'booking' && (
          <BookingView cinemas={cinemas} onCinemaCreated={refreshCinemas} />
        )}
      </main>
    </div>
  );
}
