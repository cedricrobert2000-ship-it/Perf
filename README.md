# PERF® — Run Club

The club's web app, for us and our friends: post events, sign up, get your **bib**.

Look and feel: animated gradient background with film grain, blurred editorial-fashion photos, glassmorphism, Unbounded typeface.

## Features

- **Password-free profile**: nickname + colour. A personal login link lets you get your account back on another device. Optional club code to keep strangers out.
- **Events**: run, long run, intervals, trail, bike, social run. Date, place, distance, pace, number of spots, description, cover photo (presets or upload from your phone).
- **Sign-up → bib**: number assigned automatically (001, 002…), stylish paper bib with a QR code, downloadable as a PNG.
- **Race-day check-in**: the organiser scans the bib's QR code (phone camera) or types the number → attendance confirmed.
- **Times & leaderboard**: after the start, everyone enters their time (the organiser can enter times for everyone) → podium + pace per km.
- **The wall**: messages per event (meeting point, carpooling, playlist…).
- **My bibs**: collection of upcoming bibs + trophy wall with stats (km, times).
- **Club**: attendance leaderboard, km run together.
- Add to calendar (.ics), native sharing / copy link, installable on the home screen (PWA).

## Running locally

Requires Node **22.5+** (uses the SQLite built into Node, no native dependencies).

```bash
npm install
npm run dev          # API on :3001 + Vite front end on :5173
```

Open http://localhost:5173. To test from your phone on the same Wi-Fi, use the network IP that Vite prints.

Production:

```bash
npm run build
npm start            # serves the app + the API on :3001
```

## Config (environment variables)

| Variable    | Default   | Purpose |
|-------------|-----------|---------|
| `PORT`      | `3001`    | HTTP port |
| `DATA_DIR`  | `./data`  | SQLite database + uploaded photos |
| `CLUB_CODE` | _(empty)_ | If set, required to join the club |
| `CLUB_NAME` | `PERF`    | Displayed name |
| `SEED`      | `1`       | `0` to skip creating the 3 demo events |

## Deploying (so your friends can use it)

The `Dockerfile` is ready. On Railway / Render / Fly.io: deploy the repo, mount a **persistent volume on `/data`**, set `CLUB_CODE`, and share the URL with the group.

```bash
docker build -t perf .
docker run -p 3001:3001 -v perf-data:/data -e CLUB_CODE=goperf perf
```

## Stack

React 18 + Vite · Express · `node:sqlite` · `qrcode`.
