import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtKm } from '../format.js';
import { useSession } from '../session.jsx';
import { Avatar, Spinner } from '../ui.jsx';

export default function Club() {
  const { me, config } = useSession();
  const [members, setMembers] = useState(null);

  useEffect(() => {
    api('/members').then(setMembers).catch(() => setMembers([]));
  }, []);

  const totalKm = (members || []).reduce((acc, m) => acc + m.km, 0);
  const totalRuns = (members || []).reduce((acc, m) => acc + m.done, 0);

  return (
    <div className="page">
      <section className="hello">
        <span className="eyebrow">{config.clubName} · Le crew</span>
        <h1 className="display">
          {members ? members.length : '—'} <em>membres</em>
        </h1>
      </section>

      <div className="stats glass">
        <div>
          <span className="stat-k">Km ensemble</span>
          <span className="stat-v">{fmtKm(totalKm)}</span>
        </div>
        <div>
          <span className="stat-k">Dossards portés</span>
          <span className="stat-v">{totalRuns}</span>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Classement assiduité</h2>
          <span className="muted small">events terminés</span>
        </div>
        {!members && <Spinner />}
        <ol className="leaderboard">
          {(members || []).map((m, i) => (
            <li key={m.id} className={`roster-row glass${m.id === me.id ? ' me' : ''}`}>
              <span className="lb-rank">{String(i + 1).padStart(2, '0')}</span>
              <Avatar name={m.name} color={m.color} size={40} />
              <span className="roster-name">
                {m.name}
                <span className="muted small">
                  {m.upcoming ? `${m.upcoming} à venir` : 'rien de prévu'}
                  {m.organised ? ` · ${m.organised} orga` : ''}
                </span>
              </span>
              <span className="lb-score">
                <strong>{m.done}</strong>
                <em>{fmtKm(m.km)}</em>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
