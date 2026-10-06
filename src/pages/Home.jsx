import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useSession } from '../session.jsx';
import { linkTo } from '../router.js';
import { Empty, Spinner } from '../ui.jsx';
import EventCard from './EventCard.jsx';

const FILTERS = [
  { key: 'all', label: 'Tout' },
  { key: 'mine', label: 'Mes dossards' },
  { key: 'run', label: 'Run', kinds: ['run', 'long', 'social'] },
  { key: 'track', label: 'Fractionné', kinds: ['track'] },
  { key: 'trail', label: 'Trail', kinds: ['trail'] },
  { key: 'ride', label: 'Vélo', kinds: ['ride'] },
];

export default function Home() {
  const { me } = useSession();
  const [scope, setScope] = useState('upcoming');
  const [filter, setFilter] = useState('all');
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setEvents(null);
    api(`/events?scope=${scope}`)
      .then(setEvents)
      .catch((err) => setError(err.message));
  }, [scope]);

  const f = FILTERS.find((x) => x.key === filter);
  const shown = (events || []).filter((e) => {
    if (filter === 'mine') return !!e.myBib;
    return !f.kinds || f.kinds.includes(e.kind);
  });
  const [first, ...rest] = shown;
  const nextMine = (events || []).find((e) => e.myBib && e.status !== 'done');

  return (
    <div className="page">
      <section className="hello">
        <span className="eyebrow">Salut {me.name.split(' ')[0]}</span>
        <h1 className="display">
          Prochaine
          <br />
          <em>perf</em> ?
        </h1>
        {nextMine && scope === 'upcoming' && (
          <a className="next-up glass" href={linkTo(`/e/${nextMine.id}`)}>
            <span className="muted small">Ton prochain départ</span>
            <strong>{nextMine.title}</strong>
            <span className="arrow">→</span>
          </a>
        )}
      </section>

      <div className="segmented glass">
        <button className={scope === 'upcoming' ? 'on' : ''} onClick={() => setScope('upcoming')}>
          À venir
        </button>
        <button className={scope === 'past' ? 'on' : ''} onClick={() => setScope('past')}>
          Archives
        </button>
      </div>

      <div className="chips" role="tablist">
        {FILTERS.map((x) => (
          <button key={x.key} className={`chip${filter === x.key ? ' on' : ''}`} onClick={() => setFilter(x.key)}>
            {x.label}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {!events && !error && <Spinner />}
      {events && !shown.length && (
        <Empty title={scope === 'upcoming' ? 'Rien au programme… pour l’instant.' : 'Pas encore d’archives.'}>
          {scope === 'upcoming' && (
            <a className="btn primary" href={linkTo('/new')}>
              Proposer un event
            </a>
          )}
        </Empty>
      )}
      {first && (
        <div className="event-grid">
          <EventCard event={first} featured />
          {rest.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}
