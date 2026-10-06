import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { getToken } from '../api.js';
import { Bib, downloadBib } from '../Bib.jsx';
import { MEMBER_COLORS } from '../covers.js';
import { fmtDuration, fmtKm, fmtShort } from '../format.js';
import { absoluteUrl, linkTo } from '../router.js';
import { useSession } from '../session.jsx';
import { Avatar, Empty, Modal, Spinner, useToast } from '../ui.jsx';

function ProfileEditor({ open, onClose }) {
  const { me, setMe, logout } = useSession();
  const toast = useToast();
  const [name, setName] = useState(me.name);
  const [color, setColor] = useState(me.color);

  const save = async (e) => {
    e.preventDefault();
    try {
      setMe(await api('/me', { method: 'PATCH', body: { name, color } }));
      toast('Profil à jour.');
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const copyLogin = async () => {
    try {
      await navigator.clipboard.writeText(absoluteUrl(`/login/${getToken()}`));
      toast('Lien copié. Ouvre-le sur ton autre appareil (garde-le pour toi !)');
    } catch {
      toast('Copie impossible sur ce navigateur.', 'error');
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={save} className="stack">
        <h2>Ton profil</h2>
        <label className="field">
          <span>Pseudo</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} required />
        </label>
        <div className="field">
          <span>Couleur</span>
          <div className="swatches">
            {MEMBER_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={`swatch${c === color ? ' on' : ''}`}
                style={{ '--c': c }}
                onClick={() => setColor(c)}
                aria-label={`Couleur ${c}`}
              />
            ))}
          </div>
        </div>
        <button className="btn primary block">Enregistrer</button>
        <hr />
        <p className="muted small">
          Pas de mot de passe ici : ton compte vit dans ce navigateur. Pour le retrouver sur un autre téléphone,
          utilise ton lien perso.
        </p>
        <div className="action-row">
          <button type="button" className="btn ghost" onClick={copyLogin}>
            Copier mon lien de connexion
          </button>
          <button
            type="button"
            className="btn ghost danger"
            onClick={() => window.confirm('Te déconnecter ? Garde ton lien de connexion pour revenir.') && logout()}
          >
            Déconnexion
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Me() {
  const { me } = useSession();
  const [bibs, setBibs] = useState(null);
  const [editing, setEditing] = useState(false);
  const [zoom, setZoom] = useState(null);

  useEffect(() => {
    api('/me/bibs').then(setBibs).catch(() => setBibs([]));
  }, []);

  const upcoming = (bibs || []).filter((b) => b.status !== 'done').reverse();
  const done = (bibs || []).filter((b) => b.status === 'done');
  const km = done.reduce((acc, b) => acc + (b.distanceKm || 0), 0);
  const best = done.filter((b) => b.resultS).length;

  return (
    <div className="page">
      <section className="profile">
        <Avatar name={me.name} color={me.color} size={84} />
        <div>
          <span className="eyebrow">Membre depuis le {fmtShort(me.created_at)}</span>
          <h1 className="display sm">{me.name}</h1>
          <button className="btn ghost small" onClick={() => setEditing(true)}>
            Modifier le profil
          </button>
        </div>
      </section>

      <div className="stats glass">
        <div>
          <span className="stat-k">Dossards</span>
          <span className="stat-v">{bibs ? bibs.length : '—'}</span>
        </div>
        <div>
          <span className="stat-k">Kilomètres</span>
          <span className="stat-v">{bibs ? fmtKm(km) : '—'}</span>
        </div>
        <div>
          <span className="stat-k">Chronos</span>
          <span className="stat-v">{bibs ? best : '—'}</span>
        </div>
      </div>

      {!bibs && <Spinner />}

      {bibs && !bibs.length && (
        <Empty title="Ta collection de dossards est vide.">
          <a className="btn primary" href={linkTo('/')}>
            Trouver un event
          </a>
        </Empty>
      )}

      {!!upcoming.length && (
        <section className="section">
          <div className="section-head">
            <h2>À épingler</h2>
            <span className="muted small">{upcoming.length}</span>
          </div>
          <div className="bib-grid">
            {upcoming.map((ev) => (
              <button key={ev.id} className="bib-tile" onClick={() => setZoom(ev)}>
                <Bib bib={ev.myBib} member={me} event={ev} compact />
              </button>
            ))}
          </div>
        </section>
      )}

      {!!done.length && (
        <section className="section">
          <div className="section-head">
            <h2>Le mur des trophées</h2>
            <span className="muted small">{done.length}</span>
          </div>
          <div className="bib-grid past">
            {done.map((ev) => (
              <button key={ev.id} className="bib-tile" onClick={() => setZoom(ev)}>
                <Bib bib={ev.myBib} member={me} event={ev} compact />
                {ev.resultS && <span className="bib-result">{fmtDuration(ev.resultS)}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      <Modal open={!!zoom} onClose={() => setZoom(null)} wide>
        {zoom && (
          <div className="bib-modal">
            <div className="bib-stage">
              <Bib bib={zoom.myBib} member={me} event={zoom} />
            </div>
            <div className="action-row center">
              <button className="btn primary" onClick={() => downloadBib({ bib: zoom.myBib, member: me, event: zoom })}>
                Télécharger le PNG
              </button>
              <a className="btn ghost" href={linkTo(`/e/${zoom.id}`)}>
                Voir l’event
              </a>
            </div>
          </div>
        )}
      </Modal>

      {editing && <ProfileEditor open onClose={() => setEditing(false)} />}
    </div>
  );
}
