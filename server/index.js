import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3001);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const CLUB_CODE = (process.env.CLUB_CODE || '').trim();
const CLUB_NAME = process.env.CLUB_NAME || 'PERF';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const db = openDb(path.join(DATA_DIR, 'perf.db'), { seed: process.env.SEED !== '0' });

const KINDS = ['run', 'long', 'track', 'trail', 'ride', 'social'];
// An event stays "live" (and open for check-in) this long after its start.
const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

const app = express();
app.use(express.json({ limit: '8mb' }));

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const wrap = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res);
    if (out !== undefined) res.json(out);
  } catch (err) {
    next(err);
  }
};

function str(value, { max = 200, required = false, field = 'champ' } = {}) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (required && !s) throw new HttpError(400, `Le ${field} est obligatoire.`);
  if (s.length > max) throw new HttpError(400, `Le ${field} est trop long (${max} max).`);
  return s;
}

function num(value, { min = 0, max = 1e6 } = {}) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, 'Valeur numérique invalide.');
  return n;
}

function color(value) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#ff5a1f';
}

// ---------- auth ----------

function currentMember(req) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  return db.prepare('SELECT id, name, color, created_at FROM members WHERE token = ?').get(token) || null;
}

function requireMember(req) {
  const me = currentMember(req);
  if (!me) throw new HttpError(401, 'Crée ton profil pour continuer.');
  return me;
}

function loadEvent(id) {
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(Number(id));
  if (!ev) throw new HttpError(404, 'Event introuvable.');
  return ev;
}

// Seeded events have no creator: they belong to the whole crew.
const canManage = (ev, me) => !!me && (ev.creator_id === null || ev.creator_id === me.id);

function status(ev, now = Date.now()) {
  const start = Date.parse(ev.starts_at);
  if (now < start) return 'upcoming';
  if (now < start + LIVE_WINDOW_MS) return 'live';
  return 'done';
}

// ---------- uploads ----------

function saveCover(cover) {
  if (!cover) return null;
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(cover);
  if (m) {
    const file = `${crypto.randomUUID()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, file), Buffer.from(m[2], 'base64'));
    return `/uploads/${file}`;
  }
  if (/^(preset:[a-z0-9-]+|https?:\/\/\S+|\/uploads\/[\w.-]+)$/.test(cover) && cover.length < 1000) return cover;
  throw new HttpError(400, 'Photo de couverture invalide.');
}

function removeCover(cover) {
  if (cover?.startsWith('/uploads/')) {
    fs.rm(path.join(UPLOAD_DIR, path.basename(cover)), { force: true }, () => {});
  }
}

// ---------- serializers ----------

const EVENT_SELECT = `
  SELECT e.*, m.name AS creator_name, m.color AS creator_color,
    (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id) AS count,
    (SELECT bib FROM registrations r WHERE r.event_id = e.id AND r.member_id = ?) AS my_bib
  FROM events e LEFT JOIN members m ON m.id = e.creator_id`;

function serializeEvent(row, me) {
  const preview = db
    .prepare(`SELECT m.id, m.name, m.color FROM registrations r JOIN members m ON m.id = r.member_id
              WHERE r.event_id = ? ORDER BY r.created_at LIMIT 5`)
    .all(row.id);
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    startsAt: row.starts_at,
    location: row.location,
    distanceKm: row.distance_km,
    pace: row.pace,
    description: row.description,
    capacity: row.capacity,
    cover: row.cover,
    creator: row.creator_id ? { id: row.creator_id, name: row.creator_name, color: row.creator_color } : null,
    count: row.count,
    myBib: row.my_bib ?? null,
    status: status(row),
    canManage: canManage(row, me),
    preview,
  };
}

function eventDetail(id, me) {
  const row = db.prepare(`${EVENT_SELECT} WHERE e.id = ?`).get(me?.id ?? null, Number(id));
  if (!row) throw new HttpError(404, 'Event introuvable.');
  const participants = db
    .prepare(`SELECT m.id, m.name, m.color, r.bib, r.checked_in_at AS checkedInAt, r.result_s AS resultS
              FROM registrations r JOIN members m ON m.id = r.member_id
              WHERE r.event_id = ? ORDER BY r.bib`)
    .all(row.id);
  const comments = db
    .prepare(`SELECT c.id, c.body, c.created_at AS createdAt, m.id AS memberId, m.name, m.color
              FROM comments c JOIN members m ON m.id = c.member_id
              WHERE c.event_id = ? ORDER BY c.created_at, c.id`)
    .all(row.id);
  return { ...serializeEvent(row, me), participants, comments };
}

// ---------- routes: club & members ----------

app.get('/api/config', wrap(() => ({ clubName: CLUB_NAME, requiresCode: !!CLUB_CODE })));

app.post('/api/members', wrap((req) => {
  if (CLUB_CODE && str(req.body.code).toLowerCase() !== CLUB_CODE.toLowerCase()) {
    throw new HttpError(403, 'Code du club incorrect.');
  }
  const name = str(req.body.name, { max: 24, required: true, field: 'pseudo' });
  const token = crypto.randomBytes(24).toString('base64url');
  const { lastInsertRowid } = db
    .prepare('INSERT INTO members (name, color, token) VALUES (?, ?, ?)')
    .run(name, color(req.body.color), token);
  const member = db.prepare('SELECT id, name, color, created_at FROM members WHERE id = ?').get(lastInsertRowid);
  return { member, token };
}));

app.get('/api/me', wrap((req) => requireMember(req)));

app.patch('/api/me', wrap((req) => {
  const me = requireMember(req);
  const name = str(req.body.name ?? me.name, { max: 24, required: true, field: 'pseudo' });
  db.prepare('UPDATE members SET name = ?, color = ? WHERE id = ?').run(name, color(req.body.color ?? me.color), me.id);
  return db.prepare('SELECT id, name, color, created_at FROM members WHERE id = ?').get(me.id);
}));

app.get('/api/me/bibs', wrap((req) => {
  const me = requireMember(req);
  const rows = db
    .prepare(`${EVENT_SELECT} JOIN registrations mine ON mine.event_id = e.id AND mine.member_id = ?
              ORDER BY e.starts_at DESC`)
    .all(me.id, me.id);
  return rows.map((row) => {
    const reg = db
      .prepare('SELECT checked_in_at AS checkedInAt, result_s AS resultS FROM registrations WHERE event_id = ? AND member_id = ?')
      .get(row.id, me.id);
    return { ...serializeEvent(row, me), ...reg };
  });
}));

app.get('/api/members', wrap(() => {
  const now = new Date().toISOString();
  return db
    .prepare(`SELECT m.id, m.name, m.color, m.created_at AS createdAt,
                SUM(CASE WHEN e.starts_at < ? THEN 1 ELSE 0 END) AS done,
                SUM(CASE WHEN e.starts_at >= ? THEN 1 ELSE 0 END) AS upcoming,
                COALESCE(SUM(CASE WHEN e.starts_at < ? THEN e.distance_km END), 0) AS km,
                (SELECT COUNT(*) FROM events o WHERE o.creator_id = m.id) AS organised
              FROM members m
              LEFT JOIN registrations r ON r.member_id = m.id
              LEFT JOIN events e ON e.id = r.event_id
              GROUP BY m.id
              ORDER BY done DESC, km DESC, m.created_at`)
    .all(now, now, now);
}));

// ---------- routes: events ----------

app.get('/api/events', wrap((req) => {
  const me = currentMember(req);
  const cutoff = new Date(Date.now() - LIVE_WINDOW_MS).toISOString();
  const past = req.query.scope === 'past';
  const rows = db
    .prepare(`${EVENT_SELECT} WHERE e.starts_at ${past ? '<' : '>='} ? ORDER BY e.starts_at ${past ? 'DESC' : 'ASC'} LIMIT 100`)
    .all(me?.id ?? null, cutoff);
  return rows.map((row) => serializeEvent(row, me));
}));

function readEventBody(body, existing = {}) {
  const startsAt = new Date(body.startsAt ?? existing.starts_at);
  if (Number.isNaN(startsAt.getTime())) throw new HttpError(400, 'Date invalide.');
  const kind = KINDS.includes(body.kind) ? body.kind : existing.kind || 'run';
  return {
    title: str(body.title ?? existing.title, { max: 80, required: true, field: 'titre' }),
    kind,
    starts_at: startsAt.toISOString(),
    location: str(body.location ?? existing.location, { max: 120, required: true, field: 'lieu' }),
    distance_km: num(body.distanceKm, { max: 500 }),
    pace: str(body.pace, { max: 40 }) || null,
    description: str(body.description, { max: 2000 }) || null,
    capacity: num(body.capacity, { min: 1, max: 999 }),
  };
}

app.post('/api/events', wrap((req, res) => {
  const me = requireMember(req);
  const ev = readEventBody(req.body);
  const cover = saveCover(req.body.cover);
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO events (title, kind, starts_at, location, distance_km, pace, description, capacity, cover, creator_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(ev.title, ev.kind, ev.starts_at, ev.location, ev.distance_km, ev.pace, ev.description, ev.capacity, cover, me.id);
  res.status(201);
  return eventDetail(lastInsertRowid, me);
}));

app.get('/api/events/:id', wrap((req) => eventDetail(req.params.id, currentMember(req))));

app.patch('/api/events/:id', wrap((req) => {
  const me = requireMember(req);
  const existing = loadEvent(req.params.id);
  if (!canManage(existing, me)) throw new HttpError(403, "Seul l'orga peut modifier cet event.");
  const ev = readEventBody(req.body, existing);
  let cover = existing.cover;
  if (req.body.cover !== undefined && req.body.cover !== existing.cover) {
    cover = saveCover(req.body.cover);
    removeCover(existing.cover);
  }
  db.prepare(`UPDATE events SET title = ?, kind = ?, starts_at = ?, location = ?, distance_km = ?, pace = ?,
              description = ?, capacity = ?, cover = ? WHERE id = ?`)
    .run(ev.title, ev.kind, ev.starts_at, ev.location, ev.distance_km, ev.pace, ev.description, ev.capacity, cover, existing.id);
  return eventDetail(existing.id, me);
}));

app.delete('/api/events/:id', wrap((req) => {
  const me = requireMember(req);
  const ev = loadEvent(req.params.id);
  if (!canManage(ev, me)) throw new HttpError(403, "Seul l'orga peut supprimer cet event.");
  db.prepare('DELETE FROM events WHERE id = ?').run(ev.id);
  removeCover(ev.cover);
  return { ok: true };
}));

app.post('/api/events/:id/register', wrap((req) => {
  const me = requireMember(req);
  const ev = loadEvent(req.params.id);
  if (status(ev) !== 'upcoming') throw new HttpError(409, 'Les inscriptions sont fermées, le départ est donné.');
  db.exec('BEGIN IMMEDIATE');
  try {
    const already = db.prepare('SELECT bib FROM registrations WHERE event_id = ? AND member_id = ?').get(ev.id, me.id);
    if (!already) {
      const { count, maxBib } = db
        .prepare('SELECT COUNT(*) AS count, COALESCE(MAX(bib), 0) AS maxBib FROM registrations WHERE event_id = ?')
        .get(ev.id);
      if (ev.capacity && count >= ev.capacity) throw new HttpError(409, "C'est complet ! Plus aucun dossard dispo.");
      db.prepare('INSERT INTO registrations (event_id, member_id, bib) VALUES (?, ?, ?)').run(ev.id, me.id, maxBib + 1);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return eventDetail(ev.id, me);
}));

app.delete('/api/events/:id/register', wrap((req) => {
  const me = requireMember(req);
  const ev = loadEvent(req.params.id);
  if (status(ev) !== 'upcoming') throw new HttpError(409, "Trop tard pour se désinscrire, l'event a commencé.");
  db.prepare('DELETE FROM registrations WHERE event_id = ? AND member_id = ?').run(ev.id, me.id);
  return eventDetail(ev.id, me);
}));

app.post('/api/events/:id/checkin', wrap((req) => {
  const me = requireMember(req);
  const ev = loadEvent(req.params.id);
  if (!canManage(ev, me)) throw new HttpError(403, "Seul l'orga peut valider les présences.");
  const bib = num(req.body.bib, { min: 1, max: 9999 });
  const present = req.body.present !== false;
  const { changes } = db
    .prepare('UPDATE registrations SET checked_in_at = ? WHERE event_id = ? AND bib = ?')
    .run(present ? new Date().toISOString() : null, ev.id, bib);
  if (!changes) throw new HttpError(404, `Aucun dossard n°${bib} sur cet event.`);
  return eventDetail(ev.id, me);
}));

app.put('/api/events/:id/results/:memberId', wrap((req) => {
  const me = requireMember(req);
  const ev = loadEvent(req.params.id);
  const memberId = Number(req.params.memberId);
  if (memberId !== me.id && !canManage(ev, me)) throw new HttpError(403, 'Tu ne peux saisir que ton propre chrono.');
  if (status(ev) === 'upcoming') throw new HttpError(409, 'Les chronos se saisissent après le départ.');
  const resultS = num(req.body.resultS, { min: 1, max: 7 * 24 * 3600 });
  const { changes } = db
    .prepare('UPDATE registrations SET result_s = ? WHERE event_id = ? AND member_id = ?')
    .run(resultS === null ? null : Math.round(resultS), ev.id, memberId);
  if (!changes) throw new HttpError(404, "Ce membre n'est pas inscrit.");
  return eventDetail(ev.id, me);
}));

app.post('/api/events/:id/comments', wrap((req, res) => {
  const me = requireMember(req);
  const ev = loadEvent(req.params.id);
  const body = str(req.body.body, { max: 500, required: true, field: 'message' });
  db.prepare('INSERT INTO comments (event_id, member_id, body) VALUES (?, ?, ?)').run(ev.id, me.id, body);
  res.status(201);
  return eventDetail(ev.id, me);
}));

app.get('/api/events/:id/calendar.ics', (req, res, next) => {
  try {
    const ev = loadEvent(req.params.id);
    const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const esc = (s) => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const start = Date.parse(ev.starts_at);
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      `PRODID:-//${CLUB_NAME}//Run Club//FR`,
      'BEGIN:VEVENT',
      `UID:perf-event-${ev.id}@perf`,
      `DTSTAMP:${stamp(Date.now())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(start + 90 * 60 * 1000)}`,
      `SUMMARY:${esc(`${CLUB_NAME} · ${ev.title}`)}`,
      `LOCATION:${esc(ev.location)}`,
      `DESCRIPTION:${esc(ev.description)}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    res.type('text/calendar').attachment(`perf-${ev.id}.ics`).send(ics);
  } catch (err) {
    next(err);
  }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue.' }));

// ---------- static ----------

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
const DIST = path.join(ROOT, 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

app.use((err, req, res, _next) => {
  const statusCode = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  if (statusCode === 500) console.error(err);
  res.status(statusCode).json({ error: statusCode === 500 ? 'Oups, erreur serveur.' : err.message });
});

app.listen(PORT, () => {
  console.log(`PERF API → http://localhost:${PORT}${CLUB_CODE ? ' (code club activé)' : ''}`);
});
