# Camelot Setlist

A web app that builds DJ setlists from your rekordbox library by matching **BPM** and
**Camelot key**. It supports multiple users, and each one only ever sees their own data.

What it does:

- Imports a rekordbox collection XML (tracks, playlists, nested folders).
- Scores and ranks candidates that fit the track at the cursor harmonically and in tempo.
- Builds a whole set automatically along an energy curve (rising / arc / flat / descending).
- Exports the setlist to the clipboard, to an `.m3u8` file, or as YouTube searches.
- Offers a discovery catalog scraped from Beatport genre Top 100 pages, plus single-track
  lookup through GetSongBPM, for music that isn't in your library.

The interface, the code and the documentation are in English. Test names are still
written in Turkish, left over from the project’s original working language.

## Quick start

```bash
npm install
npm run dev
```

It runs with no environment variables at all: sign-in stays off, the app falls back to
guest mode, and everything lives in the browser's `localStorage`.

```bash
npm test           # vitest (346 tests)
npm run typecheck  # tsc -b --noEmit
npm run lint       # eslint
npm run build      # tsc -b && vite build
```

## Accounts and guest mode

There are three states:

| state | what happens |
|---|---|
| **sign-in disabled** (no Supabase env) | The app works fully, storage is browser-only. A banner says so. |
| **guest** (sign-in available, not used) | Same: you can build sets and get suggestions, **nothing is written to the server**. The banner offers sign-in. |
| **signed in** | Library, setlists and settings are saved to the account and follow you to another device. |

Sign-in methods: **Continue with Google** and **email + password**.

Work you did as a guest is never written over the account record. The account record
loads, and you are offered "move the set you built as a guest into my account" — your
call. Moving **adds** the guest sets next to the account's own sets; nothing is replaced.
Colliding ids get new ids, colliding names get a suffix, and the library, extras and
playlists are merged by track id so nothing is duplicated.

## The Camelot wheel and scoring

One step around the wheel is a fifth, which is **7 semitones**. From that follows
`+7 numbers ≡ +1 semitone` and `+5 numbers ≡ −1 semitone`. The A ring is minor, the B ring
is major: `8A = Am`, `8B = C`.

Defined transitions (the `RELATIONS` table in `src/lib/camelot.ts`):

| id | label | from 8A | score | default |
|---|---|---|---|---|
| `same` | Same key | 8A | 100 | on |
| `up` | +1 · energy ↑ | 9A | 94 | on |
| `down` | −1 · softer | 7A | 92 | on |
| `relative` | Relative | 8B | 88 | on |
| `boost` | +2 · jump | 10A | 72 | on |
| `diagonal` | Diagonal | 9B | 64 | off |
| `semiUp` | +7 · semitone ↑ | 3A | 62 | off |
| `semiDown` | −7 · semitone ↓ | 1A | 56 | off |

A candidate's score:

```
score = relation score × 0.66 + tempo closeness × 0.34
```

Tempo closeness is measured against the tolerance window: 100 at an exact match, 0 at the
edge of tolerance. The default tolerance is **6%** (the pitch range of a Pioneer
DDJ-FLX4); the UI offers ±3 / ±6 / ±8 / ±10 / ±12 as preset steps, coloured green through
red because a wider window means more strain on the pitch fader. Anything outside
tolerance, or in a relation you turned off, is dropped. Half and double tempo count as
real matches: 128 ↔ 64 ↔ 256.

The automatic builder uses beam search. Greedy selection kept walking into dead ends where
the next step had no compatible candidate left; keeping several partial sets alive fixes
that. The step score is `relation × 0.55 + fit to the curve × 0.45`; the same artist within
the last few tracks and a third consecutive identical key are penalised, and a
back-to-back repeat of the same artist is never picked while another candidate exists.

## The workspace

The screen has three areas:

- **Set** (left) — the ordered track list. Each row shows position, title, key, BPM,
  length, Beatport/YouTube search buttons, and a remove button. Rows are draggable. Under
  each row you can rate the track's energy 1–5 (click the same star again to clear it) and
  write a per-track note. Between rows a bridge shows the transition's relation and tempo
  difference, and warns when either is out of bounds.
- **Flow** (right) — the tempo curve, totals (length, track count, tempo range, number of
  strained transitions) the set note, and the export buttons. It stays the same height as
  the set panel; the set list scrolls inside itself once it grows.
- **Suggestions** (full width, below) — the Camelot wheel and the reference track on the
  left, the filters (tolerance, relations, genres) on the right, and the ranked candidates
  as a list underneath. Each candidate carries a 0–100 match score, coloured on the same
  green-to-red ladder.

Saved setlists live in the top bar under **my sets**: a dropdown lists every set with
rename and delete buttons, plus "+ new set".

## Setup

### 1. Supabase

1. [supabase.com](https://supabase.com) → **New project** (the free tier is enough).
2. **SQL Editor** → paste the contents of `supabase/schema.sql` and run it. It creates the
   tables, triggers and Row Level Security policies. Running it again is safe, and the
   upgrade statements at the bottom bring an older project up to date.
3. From **Settings → API** take the `Project URL` and the `anon public` key →
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. From the same page take the `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server
   side only — never give it a `VITE_` prefix).

Free Supabase projects are paused after 7 days of inactivity. The weekly catalog refresh
writes to the database, which keeps the project awake on its own.

### 2. Sign in with Google

1. [Google Cloud Console](https://console.cloud.google.com) → new project.
2. **APIs & Services → OAuth consent screen**: External, app name and support email. Add
   yourself and anyone who will sign in as test users.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
     (Supabase → Authentication → Providers → Google shows the exact address).
4. Paste the resulting **Client ID** and **Client secret** into Supabase →
   **Authentication → Providers → Google** and enable the provider.
5. Supabase → **Authentication → URL Configuration** → set Site URL to your deployment
   address (`http://localhost:5173` while developing) and add it to Redirect URLs.

Email + password sign-in is on by default in Supabase. The free tier's built-in mailer is
limited to a few messages an hour, which is fine for a handful of people; you can also turn
email confirmation off under **Authentication → Providers → Email**.

### 3. Vercel

1. Vercel → **Add New → Project** → import the repository. The framework is detected as
   `vite` (it is also declared in `vercel.json`).
2. Enter the environment variables (table below).
3. **Do not turn on Deployment Protection.** The app has its own sign-in; site-wide
   protection would put `/api/*` behind a password too, so the app could not reach its own
   endpoints and the people you invite could not reach the site at all.

| variable | what it does | where from | without it |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Supabase address for the browser | Supabase → Settings → API | Sign-in off, app runs in guest mode |
| `VITE_SUPABASE_ANON_KEY` | Public key for the browser | same page | Same |
| `SUPABASE_URL` | Server-side address | same value as above | Catalog cannot be written, track search cannot verify sessions |
| `SUPABASE_SERVICE_ROLE_KEY` | Catalog writes and session verification | Supabase → Settings → API | Same |
| `GETSONGBPM_API_KEY` | Single-track lookup | [getsongbpm.com/api](https://getsongbpm.com/api) | "search the web" explains it is missing; manual entry still works |

`CRON_SECRET` is no longer used: the weekly refresh moved to GitHub Actions (below).

`.env.example` carries the same information for local development.

### The weekly refresh runs in GitHub Actions

`.github/workflows/refresh-catalog.yml` scrapes Beatport every Monday at 06:00 UTC,
writes the result to the `catalog` table and commits `public/catalog.json` when it
changed. Add two repository secrets to turn it on (Settings → Secrets and variables →
Actions):

| secret | value |
|---|---|
| `SUPABASE_URL` | the project address |
| `SUPABASE_SERVICE_ROLE_KEY` | the secret key |

Without the secrets the workflow simply fails and nothing else breaks; you can always
refresh from your own machine with `npm run refresh:catalog -- --supabase`. The Actions
tab also has a "Run workflow" button for a manual run.

**Why not a Vercel cron?** Vercel compiles each file under `api/` on its own and does not
follow imports into `src/lib`, so a function cannot reach the scraper — an import like
`../src/lib/catalog` throws `ERR_MODULE_NOT_FOUND` at runtime. That is why `api/catalog.ts`
only reads the table and `api/track-search.ts` only holds the API key, with the query
splitting and answer parsing left in the browser where the tested code lives.

### Seeding the catalog table

When the server-side catalog is empty the app falls back to `public/catalog.json`, so you
do not have to wait for the first cron run. To write the file you already have straight
into the table:

```bash
npm run seed:catalog
```

It uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `.env` and never touches
Beatport. To scrape again and update both the file and the table:
`npm run refresh:catalog -- --supabase`.

## Architecture

```
src/lib/          Pure logic — never touches React, the DOM or window; every module is tested
  camelot.ts        key parsing (note / Camelot / Open Key), relation table, colours
  rekordbox.ts      collection XML parser, m3u8 export
  suggest.ts        candidate scoring, tempo delta, signature de-duplication
  setbuilder.ts     beam-search set builder, energy curves
  setstats.ts       transition verdict and set totals, shared by the list and the summary
  search.ts         local search that folds diacritics (Turkish included)
  beatport.ts       catalog extraction (three strategies) and validation
  catalog.ts        genre-page refresh, per-genre report
  getsongbpm.ts     single-track query and response reading
  state-rows.ts     app state ↔ database rows mapping
  merge.ts          merges guest work into an account without replacing anything
  auth-message.ts   turns Supabase errors into actionable text
  env-file.ts       .env reader for the command-line scripts
  state.ts, types.ts, ui.ts

src/store/        State, session and persistence
  store.ts          zustand store + pure selectors
  auth.ts           session state, Google and email sign-in
  supabase.ts       client setup (null when env is missing → guest mode)
  remote.ts         per-user reads and writes, conflict resolution
  sync.ts           localStorage + remote store, guest/signed-in bootstrap

src/components/   UI
  SetlistPanel, SetSummaryPanel, SetlistMenu, SuggestPanel, CamelotWheel, TempoCurve,
  AuthDialog, ImportDialog, TrackSearchDialog, AutoBuildDialog, common

api/              Vercel functions
  track-search.ts   authenticated GetSongBPM proxy (holds the key, parses nothing)
  catalog.ts        reads the catalog table
                    Both are self-contained: Vercel compiles each route file on its
                    own, so they import nothing but @supabase/supabase-js.

scripts/
  refresh-catalog.ts  refreshes the catalog by hand (--dry writes nothing, --supabase also
                      writes the table, --from-file uploads without scraping)
  smoke.mjs           end-to-end smoke test in a real browser

supabase/
  schema.sql        tables, triggers and Row Level Security policies
```

## How persistence works

There are two layers:

1. **`localStorage`** — on every change, immediately, for everyone including guests. The
   app works without a server.
2. **Supabase** — for signed-in users only. Writes are debounced by ~2.5 seconds, so a
   burst of edits collapses into one request.

Data is split across three tables: `libraries` (the collection, one row per user),
`setlists` (one row per set) and `settings` (filters, cursor, save stamp). The library is
kept separate because of its size — we do not want to resend 20,000 tracks on every note
keystroke.

**Users cannot see each other's data,** and that is enforced by the database rather than by
the app: every table has a Row Level Security policy conditioned on `auth.uid() = user_id`.

On startup the account record is loaded. On write, if the server's `saved_at` stamp is
newer than the one being sent, the write is refused; the server's record is fetched and the
user is told — it is **never silently overwritten**.

Even when a playlist filter is active, the **whole collection** is saved; the filter only
narrows the view. (Saving the filtered list used to lose the rest of the collection on
reload.)

## An honest note on scraping Beatport

Beatport has no public API. The discovery catalog is extracted from genre Top 100 pages,
and **that is fragile**: the page structure can change without warning.

Three things guard against it:

- **Three separate strategies** are tried in order — the `__NEXT_DATA__` block, embedded
  JSON / RSC streams, and plain HTML text. A strategy that finds fewer than 10 tracks is
  not trusted, and the one that worked is recorded in the catalog's `strategy` field.
- **Validation**: at least 100 tracks, key parse rate ≥95%, ≥90% of BPMs between 90 and
  165, at least 3 genres, and the new catalog larger than half of the old one.
- **If validation fails the old catalog is kept.** Bad data never overwrites good data, and
  the refresh reports why it failed.

When the page structure changes, `npm run refresh:catalog -- --dry` says how many tracks
each strategy found; the fix belongs in the extraction strategies in `src/lib/beatport.ts`.

The last scrape pulled 875 tracks from nine genres with a 100% key parse rate; the strategy
that held was `__NEXT_DATA__`.

## Smoke test

Playwright is deliberately not a dependency (installing it pulls a ~150 MB browser). To run
it:

```bash
npm install --no-save playwright
npx playwright install chromium
npm run build && node scripts/smoke.mjs
```

The test starts a fake API server, opens the production build in a real Chromium, and walks
the flow: XML import → playlist selection → local search → web search → adding a suggestion
→ automatic set building → multiple setlists → writing notes → verifying that guest work
never reaches the server → persistence across a reload → no horizontal scrolling on mobile
→ no console errors.

Note: running `npm install` removes a Playwright installed with `--no-save`; repeat the
install line above before running the smoke test again.
