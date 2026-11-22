import { useState } from 'react';
import { api } from '../api.js';
import { plural } from '../format.js';

const MIN_GROUP = 1;
const MAX_GROUP = 10000;

function AddCinemaForm({ onCreated }) {
  const [name, setName] = useState('');
  const [sizes, setSizes] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError(null);

    const parts = sizes.split(/[\s,]+/).filter(Boolean);
    const bundleSizes = parts.map(Number);
    if (parts.length === 0 || bundleSizes.some((n) => !Number.isInteger(n))) {
      setError('Enter bundle sizes as whole numbers separated by commas, e.g. 2, 5');
      return;
    }
    if (bundleSizes.some((n) => n < 1 || n > 500)) {
      setError('Each bundle size must be between 1 and 500 seats');
      return;
    }
    if (new Set(bundleSizes).size < 1 || new Set(bundleSizes).size > 10) {
      setError('Enter between 1 and 10 different bundle sizes');
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Enter a cinema name');
      return;
    }

    setBusy(true);
    try {
      await api.createCinema({ name: trimmedName, bundleSizes });
      setName('');
      setSizes('');
      await onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Add a cinema</h2>
      <div className="grid-2">
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
        </label>
        <label className="field">
          <span>Bundle sizes (1–10 sizes, 1–500 seats each)</span>
          <input
            value={sizes}
            onChange={(e) => setSizes(e.target.value)}
            required
            placeholder="2, 5"
            inputMode="numeric"
          />
        </label>
      </div>
      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
      <div>
        <button className="btn" disabled={busy}>
          {busy ? 'Adding…' : 'Add cinema'}
        </button>
      </div>
    </form>
  );
}

export default function BookingView({ cinemas, onCinemaCreated }) {
  const [cinemaId, setCinemaId] = useState(() => {
    const saved = Number(window.localStorage.getItem('doomsday-selected-cinema'));
    return cinemas.some((cinema) => cinema.id === saved) ? saved : cinemas[0]?.id ?? '';
  });
  const [groupSize, setGroupSize] = useState('');
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Keep the selection valid if the list changes (e.g. a cinema was just added).
  const selectedId = cinemas.some((c) => c.id === Number(cinemaId)) ? Number(cinemaId) : cinemas[0]?.id;
  const cinema = cinemas.find((c) => c.id === selectedId);

  async function submit(event) {
    event.preventDefault();
    setError(null);
    setQuote(null);

    const size = Number(groupSize);
    if (!Number.isInteger(size) || size < MIN_GROUP || size > MAX_GROUP) {
      setError(`Group size must be a whole number between ${MIN_GROUP} and ${MAX_GROUP.toLocaleString()}.`);
      return;
    }

    setBusy(true);
    try {
      setQuote(await api.booking(selectedId, size));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const changeCinema = (value) => {
    setCinemaId(value);
    window.localStorage.setItem('doomsday-selected-cinema', String(value));
    setQuote(null);
    setError(null);
  };

  return (
    <div className="stack">
      {cinemas.length === 0 ? (
        <p className="card muted">No cinemas yet. Add one below to get a booking quote.</p>
      ) : (
        <form className="card form" onSubmit={submit}>
          <h2>Book a watch party</h2>
          <div className="grid-2">
            <label className="field">
              <span>Cinema</span>
              <select value={selectedId} onChange={(e) => changeCinema(e.target.value)}>
                {cinemas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Group size</span>
              <input
                type="number"
                value={groupSize}
                onChange={(e) => {
                  setGroupSize(e.target.value);
                  setQuote(null);
                }}
                required
                min={MIN_GROUP}
                max={MAX_GROUP}
                step={1}
                placeholder="e.g. 11"
              />
            </label>
          </div>
          {cinema && (
            <p className="muted small">
              {cinema.name} sells opening-night seats only in bundles of{' '}
              {cinema.bundleSizes.map((s, i) => (
                <span key={s}>
                  {i > 0 && (i === cinema.bundleSizes.length - 1 ? ' and ' : ', ')}
                  <strong>{s}</strong>
                </span>
              ))}
              .
            </p>
          )}
          {error && (
            <div className="banner error" role="alert">
              {error}
            </div>
          )}
          <div>
            <button className="btn primary" disabled={busy}>
              {busy ? 'Working it out…' : 'Get quote'}
            </button>
          </div>

          {quote &&
            (quote.possible ? (
              <div className="ticket" role="status">
                <p className="result-title">
                  Buy {quote.totalBundles} {plural(quote.totalBundles, 'bundle')} for {quote.groupSize}{' '}
                  {plural(quote.groupSize, 'seat')}
                </p>
                <div className="perf" aria-hidden="true" />
                <ul className="bundles">
                  {quote.bundles.map((b) => (
                    <li key={b.size}>
                      <strong>
                        {b.size} × {b.count}
                      </strong>
                      <span>
                        {b.count} {plural(b.count, 'bundle')} of {b.size} {plural(b.size, 'seat')}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="ticket-note">Every seat is filled exactly. Nobody pays for an empty one.</p>
              </div>
            ) : (
              <div className="result no" role="status">
                <p className="result-title">Not possible</p>
                <p className="muted">{quote.message}</p>
              </div>
            ))}
        </form>
      )}

      <AddCinemaForm onCreated={onCinemaCreated} />
    </div>
  );
}
