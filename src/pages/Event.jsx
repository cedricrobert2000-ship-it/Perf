import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Bib, downloadBib } from '../Bib.jsx';
import { KINDS, resolveCover } from '../covers.js';
import { fmtDay, fmtDuration, fmtKm, fmtPace, fmtTime, padBib, parseDuration, relative } from '../format.js';
import { absoluteUrl, linkTo, navigate } from '../router.js';
import { useSession } from '../session.jsx';
import { Avatar, Empty, Modal, Photo, Spinner, useToast } from '../ui.jsx';
import { StatusPill } from './EventCard.jsx';

function DurationInput({ value, onSave, placeholder = 'mm:ss' }) {
  const [draft, setDraft] = useState(value == null ? '' : fmtDuration(value));
  useEffect(() => setDraft(value == null ? '' : fmtDuration(value)), [value]);
  const commit = () => {
    const s = parseDuration(draft);
    if (Number.isNaN(s)) return setDraft(value == null ? '' : fmtDuration(value));
    if (s !== value) onSave(s);
  };
  return (
    <input
      className="time-input"
      value={draft}
      placeholder={placeholder}
      inputMode="numeric"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

function Participants({ event, me, act }) {
  const showResults = event.status !== 'upcoming';
  const rows = [...event.participants];
  if (showResults) {
    rows.sort((a, b) => (a.resultS ?? Infinity) - (b.resultS ?? Infinity) || a.bib - b.bib);
  }
  let rank = 0;

  if (!rows.length) {
    return (
      <Empty title="Personne encore.">
        <p className="muted">Sois le premier à prendre un dossard, les autres suivront.</p>
      </Empty>
    );
  }

  return (
    <ul className="roster">
      {rows.map((p) => {
        const editable = showResults && (event.canManage || p.id === me.id);
        if (p.resultS != null) rank += 1;
        return (
          <li key={p.id} className={`roster-row glass${p.id === me.id ? ' me' : ''}`}>
            <span className="roster-bib">{padBib(p.bib)}</span>
            <Avatar name={p.name} color={p.color} size={34} />
            <span className="roster-name">
              {p.name}
              {p.checkedInAt && <span className="badge ok">Présent</span>}
            </span>
            {showResults && p.resultS != null && (
              <span className="roster-rank">
                {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `#${rank}`}
                {event.distanceKm ? <em>{fmtPace(p.resultS, event.distanceKm)}</em> : null}
              </span>
            )}
            {editable ? (
              <DurationInput value={p.resultS} onSave={(s) => act(`/results/${p.id}`, 'PUT', { resultS: s }, 'Chrono enregistré ⏱')} />
            ) : (
              showResults && <span className="roster-time">{fmtDuration(p.resultS) || '—'}</span>
            )}
            {event.canManage && (
              <button
                className={`checkin-toggle${p.checkedInAt ? ' on' : ''}`}
                onClick={() => act('/checkin', 'POST', { bib: p.bib, present: !p.checkedInAt })}
                aria-label="Basculer la présence"
                title="Présence"
              >
                ✓
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function OrgaDesk({ event, act }) {
  const [bib, setBib] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (await act('/checkin', 'POST', { bib: Number(bib) }, `Dossard ${padBib(bib)} validé ✓`)) setBib('');
  };
  const present = event.participants.filter((p) => p.checkedInAt).length;
  return (
    <section className="card glass orga">
      <div className="section-head">
        <h3>Table de l’orga</h3>
        <span className="muted small">
          {present}/{event.participants.length} présents
        </span>
      </div>
      <p className="muted small">
        Scanne le QR des dossards avec l’appareil photo du téléphone, ou tape le numéro ici.
      </p>
      <form className="inline-form" onSubmit={submit}>
        <input value={bib} onChange={(e) => setBib(e.target.value.replace(/\D/g, ''))} placeholder="N° de dossard" inputMode="numeric" />
        <button className="btn primary" disabled={!bib}>
          Valider
        </button>
      </form>
    </section>
  );
}

function Wall({ event, me, act }) {
  const [body, setBody] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (await act('/comments', 'POST', { body })) setBody('');
  };
  return (
    <section className="card glass">
      <div className="section-head">
        <h3>Le mur</h3>
        <span className="muted small">{event.comments.length} msg</span>
      </div>
      <ul className="wall">
        {event.comments.map((c) => (
          <li key={c.id} className={c.memberId === me.id ? 'mine' : ''}>
            <Avatar name={c.name} color={c.color} size={28} />
            <div>
              <span className="wall-meta">
                {c.name} · {relative(c.createdAt)}
              </span>
              <p>{c.body}</p>
            </div>
          </li>
        ))}
        {!event.comments.length && <li className="muted small">Lance la conv : point de rdv, covoit’, playlist…</li>}
      </ul>
      <form className="inline-form" onSubmit={submit}>
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Écris un message…" maxLength={500} />
        <button className="btn" disabled={!body.trim()}>
          Envoyer
        </button>
      </form>
    </section>
  );
}

export default function EventPage({ id }) {
  const { me } = useSession();
  const toast = useToast();
  const [event, setEvent] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bibOpen, setBibOpen] = useState(false);

  useEffect(() => {
    setEvent(null);
    api(`/events/${id}`).then(setEvent).catch((err) => setError(err.message));
  }, [id]);

  const act = useCallback(
    async (suffix, method, body, success) => {
      setBusy(true);
      try {
        setEvent(await api(`/events/${id}${suffix}`, { method, body }));
        if (success) toast(success);
        return true;
      } catch (err) {
        toast(err.message, 'error');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [id, toast],
  );

  if (error) return <Empty title={error}><a className="btn" href={linkTo('/')}>Retour aux events</a></Empty>;
  if (!event) return <Spinner />;

  const cover = resolveCover(event.cover, event.id);
  const full = event.capacity && event.count >= event.capacity;
  const left = event.capacity ? Math.max(0, event.capacity - event.count) : null;
  const myBib = event.myBib;

  const register = async () => {
    if (await act('/register', 'POST')) setBibOpen(true);
  };
  const unregister = async () => {
    if (window.confirm('Rendre ton dossard ?')) await act('/register', 'DELETE', undefined, 'Dossard rendu. Une prochaine fois !');
  };
  const remove = async () => {
    if (!window.confirm('Supprimer cet event pour tout le monde ?')) return;
    try {
      await api(`/events/${id}`, { method: 'DELETE' });
      toast('Event supprimé.');
      navigate('/');
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  const share = async () => {
    const url = absoluteUrl(`/e/${event.id}`);
    const text = `${event.title} — ${fmtDay(event.startsAt)} ${fmtTime(event.startsAt)} · ${event.location}. Prends ton dossard 👉`;
    try {
      if (navigator.share) await navigator.share({ title: `PERF · ${event.title}`, text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast('Lien copié, balance-le sur le groupe !');
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  return (
    <div className="page event-page">
      <Photo src={cover.src} gradient={cover.gradient} blur="sm" className="event-hero">
        <a className="back" href={linkTo('/')}>
          ← Events
        </a>
        <div className="event-hero-body">
          <div className="tags">
            <span className="tag">{KINDS[event.kind] || 'Run'}</span>
            <StatusPill event={event} />
          </div>
          <h1 className="display sm">{event.title}</h1>
          <p className="event-when">
            <span className="cap">{fmtDay(event.startsAt)}</span> · {fmtTime(event.startsAt)}
            <br />
            {event.location}
          </p>
        </div>
      </Photo>

      <div className="stats glass">
        <div>
          <span className="stat-k">Distance</span>
          <span className="stat-v">{event.distanceKm != null ? fmtKm(event.distanceKm) : '—'}</span>
        </div>
        <div>
          <span className="stat-k">Allure</span>
          <span className="stat-v">{event.pace || 'Libre'}</span>
        </div>
        <div>
          <span className="stat-k">Dossards</span>
          <span className="stat-v">
            {event.count}
            {event.capacity ? <small>/{event.capacity}</small> : ''}
          </span>
        </div>
      </div>

      <div className="action-bar">
        {event.status === 'upcoming' && !myBib && (
          <button className="btn primary big" onClick={register} disabled={busy || full}>
            {full ? 'Complet' : 'Je prends un dossard'}
            {left != null && !full && <small>{left} restant{left > 1 ? 's' : ''}</small>}
          </button>
        )}
        {myBib && (
          <button className="btn primary big" onClick={() => setBibOpen(true)}>
            Mon dossard <strong className="mono">{padBib(myBib)}</strong>
          </button>
        )}
        <div className="action-row">
          <a className="btn ghost" href={`/api/events/${event.id}/calendar.ics`}>
            + Agenda
          </a>
          <button className="btn ghost" onClick={share}>
            Partager
          </button>
          {myBib && event.status === 'upcoming' && (
            <button className="btn ghost" onClick={unregister} disabled={busy}>
              Se désinscrire
            </button>
          )}
        </div>
      </div>

      {event.description && (
        <section className="card glass">
          <h3>Le plan</h3>
          <p className="prose">{event.description}</p>
          <p className="muted small orga-line">
            Orga : {event.creator ? event.creator.name : 'le crew PERF'}
          </p>
        </section>
      )}

      {event.canManage && event.count > 0 && <OrgaDesk event={event} act={act} />}

      <section className="section">
        <div className="section-head">
          <h2>{event.status === 'upcoming' ? 'Sur la ligne de départ' : 'Classement'}</h2>
          <span className="muted small">{event.count} coureur{event.count > 1 ? 's' : ''}</span>
        </div>
        {event.status !== 'upcoming' && myBib && (
          <p className="muted small">Tape ton chrono (ex. 42:10 ou 1:35:20) pour entrer au classement.</p>
        )}
        <Participants event={event} me={me} act={act} />
      </section>

      <Wall event={event} me={me} act={act} />

      {event.canManage && (
        <div className="danger-zone">
          <a className="btn ghost" href={linkTo(`/e/${event.id}/edit`)}>
            Modifier l’event
          </a>
          <button className="btn ghost danger" onClick={remove}>
            Supprimer
          </button>
        </div>
      )}

      <Modal open={bibOpen && !!myBib} onClose={() => setBibOpen(false)} wide>
        {myBib && (
          <div className="bib-modal">
            <span className="eyebrow">Inscription validée</span>
            <h2>Voilà ton dossard.</h2>
            <div className="bib-stage">
              <Bib bib={myBib} member={me} event={event} />
            </div>
            <p className="muted small center">
              Le QR code sert au check-in le jour J. Épingle-le (ou garde-le dans ta galerie).
            </p>
            <div className="action-row center">
              <button className="btn primary" onClick={() => downloadBib({ bib: myBib, member: me, event })}>
                Télécharger le PNG
              </button>
              <a className="btn ghost" href={`/api/events/${event.id}/calendar.ics`}>
                + Agenda
              </a>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
