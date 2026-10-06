import { resolveCover, KINDS } from '../covers.js';
import { dateChip, fmtKm, fmtTime, padBib, relative } from '../format.js';
import { linkTo } from '../router.js';
import { AvatarStack, Photo } from '../ui.jsx';

export function StatusPill({ event }) {
  if (event.status === 'live') return <span className="pill live">● En cours</span>;
  if (event.status === 'done') return <span className="pill">Terminé</span>;
  const full = event.capacity && event.count >= event.capacity;
  if (full) return <span className="pill warn">Complet</span>;
  return <span className="pill">{relative(event.startsAt)}</span>;
}

export default function EventCard({ event, featured = false }) {
  const cover = resolveCover(event.cover, event.id);
  const chip = dateChip(event.startsAt);
  return (
    <a href={linkTo(`/e/${event.id}`)} className={`event-card${featured ? ' featured' : ''}`}>
      <Photo src={cover.src} gradient={cover.gradient} blur={featured ? 'sm' : 'md'}>
        <div className="event-card-top">
          <div className="date-chip">
            <span>{chip.weekday}</span>
            <strong>{chip.day}</strong>
            <span>{chip.month}</span>
          </div>
          <StatusPill event={event} />
        </div>
        <div className="event-card-body">
          <div className="tags">
            <span className="tag">{KINDS[event.kind] || 'Run'}</span>
            {event.distanceKm != null && <span className="tag">{fmtKm(event.distanceKm)}</span>}
            {event.pace && <span className="tag">{event.pace}</span>}
          </div>
          <h3>{event.title}</h3>
          <p className="event-card-where">
            {fmtTime(event.startsAt)} · {event.location}
          </p>
          <div className="event-card-foot">
            <AvatarStack people={event.preview} total={event.count} size={28} />
            <span className="muted small">
              {event.count} inscrit{event.count > 1 ? 's' : ''}
              {event.capacity ? ` / ${event.capacity}` : ''}
            </span>
            {event.myBib && <span className="my-bib">Dossard {padBib(event.myBib)}</span>}
          </div>
        </div>
      </Photo>
    </a>
  );
}
