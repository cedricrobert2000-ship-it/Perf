import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtDay, fmtTime, padBib } from '../format.js';
import { linkTo } from '../router.js';
import { Avatar, Empty, Spinner, useToast } from '../ui.jsx';

// Landing page of the QR code printed on each bib.
export default function Checkin({ eventId, bib }) {
  const toast = useToast();
  const [event, setEvent] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/events/${eventId}`).then(setEvent).catch((err) => setError(err.message));
  }, [eventId]);

  if (error) return <Empty title={error} />;
  if (!event) return <Spinner />;

  const runner = event.participants.find((p) => p.bib === Number(bib));
  if (!runner) {
    return (
      <Empty title={`Dossard ${padBib(bib)} inconnu sur cet event.`}>
        <a className="btn" href={linkTo(`/e/${event.id}`)}>
          Voir l’event
        </a>
      </Empty>
    );
  }

  const validate = async () => {
    try {
      setEvent(await api(`/events/${event.id}/checkin`, { method: 'POST', body: { bib: Number(bib) } }));
      toast(`${runner.name} est sur la ligne ✓`);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="page checkin">
      <div className={`checkin-card glass${runner.checkedInAt ? ' ok' : ''}`}>
        <span className="eyebrow">Check-in · {event.title}</span>
        <div className="checkin-bib">{padBib(runner.bib)}</div>
        <div className="checkin-who">
          <Avatar name={runner.name} color={runner.color} size={48} />
          <strong>{runner.name}</strong>
        </div>
        <p className="muted small">
          {fmtDay(event.startsAt)} · {fmtTime(event.startsAt)} · {event.location}
        </p>
        {runner.checkedInAt ? (
          <p className="checkin-status">✓ Présence validée</p>
        ) : event.canManage ? (
          <button className="btn primary big block" onClick={validate}>
            Valider la présence
          </button>
        ) : (
          <p className="muted">Dossard valide. Seul l’orga peut valider la présence.</p>
        )}
        <a className="btn ghost block" href={linkTo(`/e/${event.id}`)}>
          Voir l’event
        </a>
      </div>
    </div>
  );
}
