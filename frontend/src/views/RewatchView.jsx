import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { byRelease, formatMinutes, plural } from '../format.js';

export default function RewatchView({ movies }) {
  // Default to the newest release: that is the one fans are preparing for.
  const [targetId, setTargetId] = useState(() => {
    const sorted = byRelease(movies);
    return sorted.length > 0 ? sorted[sorted.length - 1].id : null;
  });
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (targetId === null) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .rewatchOrder(targetId)
      .then((result) => {
        if (!cancelled) setPlan(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setPlan(null);
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [targetId]);

  if (movies.length === 0) {
    return <p className="card muted">Add some movies first, then come back to plan your rewatch.</p>;
  }

  const percent = plan && plan.totalCount > 0 ? Math.round((plan.watchedCount / plan.totalCount) * 100) : 0;

  return (
    <div className="stack">
      <div className="card form">
        <h2>Rewatch plan</h2>
        <label className="field">
          <span>I want to watch</span>
          <select value={targetId ?? ''} onChange={(e) => setTargetId(Number(e.target.value))}>
            {byRelease(movies).map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} ({m.releaseYear})
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      {plan && !error && (
        <section className="card" aria-busy={loading}>
          {plan.totalCount === 0 ? (
            <p>
              Nothing to watch first. You are ready for <strong>{plan.movie.title}</strong>.
            </p>
          ) : (
            <>
              <div className="progress-head">
                <strong>
                  {plan.watchedCount} of {plan.totalCount} watched
                </strong>
                <span className="muted">
                  {plan.remainingMinutes === 0
                    ? 'All caught up!'
                    : `${formatMinutes(plan.remainingMinutes)} left to watch`}
                </span>
              </div>
              <div
                className="progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={plan.totalCount}
                aria-valuenow={plan.watchedCount}
                aria-label={`${plan.watchedCount} of ${plan.totalCount} ${plural(plan.totalCount, 'movie')} watched`}
              >
                <div className="progress-fill" style={{ width: `${percent}%` }} />
              </div>

              <p className="muted small">
                Watch these in this order before <strong>{plan.movie.title}</strong>:
              </p>
              <ol className="plan">
                {plan.order.map((m, index) => (
                  <li key={m.id} className={m.watched ? 'plan-item done' : 'plan-item'}>
                    <span className="marker" aria-hidden="true">
                      {m.watched ? '✓' : index + 1}
                    </span>
                    <span className="plan-title">
                      {m.title}
                      <span className="visually-hidden">{m.watched ? ' (watched)' : ' (not watched)'}</span>
                    </span>
                    <span className="meta">
                      <span>{m.releaseYear}</span>
                      <span>{formatMinutes(m.runtime)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      )}
    </div>
  );
}
