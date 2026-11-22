import { byRelease } from '../format.js';

/**
 * A checklist of movies to choose prerequisites from.
 * `excludeId` hides the movie being edited (it cannot depend on itself).
 */
export default function PrerequisitePicker({ movies, selected, onChange, excludeId, idPrefix }) {
  const options = byRelease(movies).filter((m) => m.id !== excludeId);

  if (options.length === 0) {
    return <p className="muted small">No other movies yet.</p>;
  }

  const toggle = (id) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <div className="picker" role="group" aria-label="Prerequisites">
      {options.map((m) => (
        <label key={m.id} className="check" htmlFor={`${idPrefix}-${m.id}`}>
          <input
            id={`${idPrefix}-${m.id}`}
            type="checkbox"
            checked={selected.includes(m.id)}
            onChange={() => toggle(m.id)}
          />
          <span>
            {m.title} <span className="muted">({m.releaseYear})</span>
          </span>
        </label>
      ))}
    </div>
  );
}
