import { useState } from 'react';
import { useSession } from '../session.jsx';
import { COVERS, MEMBER_COLORS } from '../covers.js';
import { Avatar, Photo } from '../ui.jsx';

export default function Welcome() {
  const { signUp, config } = useSession();
  const [name, setName] = useState('');
  const [color, setColor] = useState(MEMBER_COLORS[0]);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signUp({ name, color, code });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="welcome">
      <Photo src={COVERS[0].url} gradient={COVERS[0].gradient} blur="xl" className="welcome-photo">
        <div className="welcome-hero">
          <span className="eyebrow">Run club · Entre potes</span>
          <h1 className="mega">PERF</h1>
          <p className="lede">
            On propose, on s’inscrit, on prend son dossard.
            <br />
            Et on court.
          </p>
        </div>
      </Photo>

      <form className="welcome-card glass" onSubmit={submit}>
        <h2>Rejoins le crew</h2>
        <p className="muted">Choisis ton blaze de coureur. Il sera imprimé sur tes dossards.</p>

        <label className="field">
          <span>Pseudo</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex. Flash Cédric"
            maxLength={24}
            autoFocus
            required
          />
        </label>

        <div className="field">
          <span>Ta couleur</span>
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

        {config.requiresCode && (
          <label className="field">
            <span>Code du club</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Demande-le à l’orga" required />
          </label>
        )}

        {error && <p className="error">{error}</p>}

        <button className="btn primary block" disabled={busy || !name.trim()}>
          <Avatar name={name || '?'} color={color} size={26} />
          {busy ? 'Ça arrive…' : 'Entrer dans le club'}
        </button>
      </form>
    </div>
  );
}
