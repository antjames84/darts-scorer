# Home Darts Scorer

A local-first darts scoring app for home play. 501 and 301 (single leg, best
of 3, best of 5), Round the Clock, and per-number accuracy tracking so you
can see which number on the board you're actually weakest on, over time.

No backend, no account, no database quota. All data lives on your device in
IndexedDB via [Dexie](https://dexie.org). That's a deliberate choice for a
single-player home app — see "Data and backups" below for the tradeoff.

## Running it locally

```
npm install
npm run dev
```

Open the printed local URL on your phone (same wifi network) or in a
desktop browser to try it.

## Deploying to GitHub Pages

1. Push this project to a new GitHub repository.
2. In the repo settings, go to **Settings → Pages** and set Source to
   **GitHub Actions**.
3. Push to `main`. The included workflow (`.github/workflows/deploy.yml`)
   builds the app and deploys it automatically. It works out of the box for
   any repo name — the build step reads the repository name at build time
   and sets the correct base path, so you don't need to edit
   `vite.config.js`.
4. Your app will be live at `https://<your-username>.github.io/<repo-name>/`.
5. On your phone, open that URL in Safari or Chrome and use "Add to Home
   Screen" — it installs as a proper app icon and works offline after the
   first load, since it's a PWA.

## How the games work

**501 / 301**: standard countdown rules. Enter each dart (multiplier, then
segment). Going below zero, or leaving exactly 1, is a bust and your score
reverts to what it was at the start of that turn. You must finish on a
double (or double bull). Best of 3 / best of 5 plays repeated legs with the
throw order rotating each leg, first to the majority of legs wins the
match.

**Round the Clock**: starts on 1, tap Hit or Miss for each dart. A hit
advances you to the next number; a miss just logs against the current
number. After 20, the final target is the bull — any hit there (either
ring) finishes the round, there's no double requirement. Play tracks a
running hit tally as you go, shows the last few throws of the current turn
so you can confirm a tap actually registered, and you can end a session
early at any time — whatever's been thrown so far is already saved,
nothing is lost by stopping partway through.

## How the weakest-number stats work

Stats are built entirely from Round the Clock throws, because that's the
only mode where each dart has an unambiguous target. In 501/301 you're
scoring for the best outcome, not aiming at a specific number, so those
throws aren't included. Play Round the Clock regularly and the Stats page
will show your hit rate for each number (e.g. "3/6, 50%") and highlight
your five weakest.

## Data and backups

Everything is stored only in this browser, on this device. That means:

- No sync between your phone and a laptop, unless you export/import.
- Clearing site data, reinstalling, or switching phones wipes it.

The **Players** page has Export and Import buttons that dump/restore
everything as a single JSON file. Get in the habit of exporting one
occasionally (Files app, iCloud, email to yourself, wherever) — it costs
ten seconds and is your only backup.

If you later want automatic cross-device sync, that's the point to
introduce a backend (Supabase, Turso, Cloudflare D1, etc.) — not before,
since a single-device app has no use for one.

## Project structure

```
src/
  db.js              Dexie schema + export/import
  game/
    countdown.js     501/301 rules (pure functions, unit-testable)
    clock.js         Round the Clock rules
    stats.js         per-number accuracy aggregation
  pages/             one file per screen
  components/        NumberPad, Scoreboard
```

## Possible extensions

- Checkout suggestions (e.g. "you're on 40, try D20") in the 501/301 pad.
- A trend chart for a given number's accuracy over time (the data —
  `recentVsEarlier` in `stats.js` — is already there, just not plotted).
- Cricket or other game modes, using the same throw-logging pattern.
