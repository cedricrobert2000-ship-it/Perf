import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    location TEXT NOT NULL,
    distance_km REAL,
    pace TEXT,
    description TEXT,
    capacity INTEGER,
    cover TEXT,
    creator_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS events_starts_at ON events(starts_at);

  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    bib INTEGER NOT NULL,
    checked_in_at TEXT,
    result_s INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (event_id, member_id),
    UNIQUE (event_id, bib)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`;

// Next occurrence of `weekday` (0 = Sunday) at `hour`:`minute`, at least one day from now.
function nextWeekday(weekday, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function seed(db) {
  const insert = db.prepare(`INSERT INTO events (title, kind, starts_at, location, distance_km, pace, description, capacity, cover)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insert.run(
    'Sunday Long Run', 'long', nextWeekday(0, 9, 30), 'Pont des Arts → Bois de Vincennes', 18, "5'30/km",
    'On part ensemble, on rentre ensemble. Allure conversation, café obligatoire à l’arrivée.', null, 'preset:road',
  );
  insert.run(
    'Track Tuesday — 10×400', 'track', nextWeekday(2, 19, 15), 'Stade Charléty', 8, 'VMA',
    'Échauffement 15 min, 10×400 récup 1 min, retour au calme. Ramène tes pointes si t’en as.', 20, 'preset:track',
  );
  insert.run(
    'Golden Hour 7K', 'social', nextWeekday(4, 19, 0), 'Canal Saint-Martin', 7, "5'45/km",
    'Run tranquille au coucher du soleil puis apéro au bord du canal. Les nouveaux sont les bienvenus.', 30, 'preset:sunset',
  );
}

export function openDb(file, { seed: shouldSeed = true } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM events').get();
  if (shouldSeed && n === 0) seed(db);
  return db;
}
