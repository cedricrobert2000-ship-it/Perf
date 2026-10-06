import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { COVERS, KINDS, compressImage, resolveCover } from '../covers.js';
import { toLocalInput } from '../format.js';
import { linkTo, navigate } from '../router.js';
import { Photo, Spinner, useToast } from '../ui.jsx';

function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  d.setHours(19, 0, 0, 0);
  return toLocalInput(d.toISOString());
}

const EMPTY = {
  title: '',
  kind: 'run',
  startsAt: defaultStart(),
  location: '',
  distanceKm: '',
  pace: '',
  capacity: '',
  description: '',
  cover: 'preset:road',
};

export default function EventForm({ id }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [form, setForm] = useState(id ? null : EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    api(`/events/${id}`)
      .then((ev) => {
        if (!ev.canManage) {
          toast("Seul l'orga peut modifier cet event.", 'error');
          navigate(`/e/${id}`);
          return;
        }
        setForm({
          title: ev.title,
          kind: ev.kind,
          startsAt: toLocalInput(ev.startsAt),
          location: ev.location,
          distanceKm: ev.distanceKm ?? '',
          pace: ev.pace ?? '',
          capacity: ev.capacity ?? '',
          description: ev.description ?? '',
          cover: ev.cover ?? '',
        });
      })
      .catch((err) => toast(err.message, 'error'));
  }, [id, toast]);

  if (!form) return <Spinner />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const preview = resolveCover(form.cover, 0);

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      setForm((f) => ({ ...f, cover: dataUrl }));
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...form, startsAt: new Date(form.startsAt).toISOString() };
      const ev = await api(id ? `/events/${id}` : '/events', { method: id ? 'PATCH' : 'POST', body });
      toast(id ? 'Event mis à jour.' : 'Event lancé 🚀 Partage-le au crew !');
      navigate(`/e/${ev.id}`);
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };

  return (
    <form className="page form-page" onSubmit={submit}>
      <a className="back" href={linkTo(id ? `/e/${id}` : '/')}>
        ← Retour
      </a>
      <h1 className="display sm">{id ? 'Modifier' : 'Nouvel event'}</h1>

      <Photo src={preview.src} gradient={preview.gradient} blur="md" className="form-cover">
        <div className="form-cover-body">
          <span className="tag">{KINDS[form.kind]}</span>
          <h2>{form.title || 'Ton titre ici'}</h2>
        </div>
      </Photo>

      <div className="cover-picker">
        {COVERS.map((c) => (
          <button
            type="button"
            key={c.key}
            className={`cover-thumb${form.cover === `preset:${c.key}` ? ' on' : ''}`}
            onClick={() => setForm((f) => ({ ...f, cover: `preset:${c.key}` }))}
            style={{ backgroundImage: `url(${c.url}), ${c.gradient}` }}
            title={c.label}
          >
            <span>{c.label}</span>
          </button>
        ))}
        <button type="button" className="cover-thumb upload" onClick={() => fileRef.current?.click()}>
          <span>+ Ta photo</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickFile} />
      </div>

      <div className="card glass form-grid">
        <label className="field span-2">
          <span>Titre</span>
          <input value={form.title} onChange={set('title')} placeholder="Sunday Long Run" maxLength={80} required />
        </label>

        <div className="field span-2">
          <span>Type</span>
          <div className="chips">
            {Object.entries(KINDS).map(([key, label]) => (
              <button
                type="button"
                key={key}
                className={`chip${form.kind === key ? ' on' : ''}`}
                onClick={() => setForm((f) => ({ ...f, kind: key }))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Date & heure</span>
          <input type="datetime-local" value={form.startsAt} onChange={set('startsAt')} required />
        </label>
        <label className="field">
          <span>Point de rdv</span>
          <input value={form.location} onChange={set('location')} placeholder="Devant le café du canal" maxLength={120} required />
        </label>
        <label className="field">
          <span>Distance (km)</span>
          <input type="number" min="0" step="0.1" value={form.distanceKm} onChange={set('distanceKm')} placeholder="10" />
        </label>
        <label className="field">
          <span>Allure</span>
          <input value={form.pace} onChange={set('pace')} placeholder="5'30/km, cool, VMA…" maxLength={40} />
        </label>
        <label className="field">
          <span>Places (vide = illimité)</span>
          <input type="number" min="1" value={form.capacity} onChange={set('capacity')} placeholder="∞" />
        </label>
        <label className="field span-2">
          <span>Le plan</span>
          <textarea
            rows={4}
            value={form.description}
            onChange={set('description')}
            placeholder="Parcours, échauffement, after… tout ce que le crew doit savoir."
            maxLength={2000}
          />
        </label>
      </div>

      <button className="btn primary big block" disabled={busy}>
        {busy ? 'Envoi…' : id ? 'Enregistrer' : 'Publier l’event'}
      </button>
    </form>
  );
}
