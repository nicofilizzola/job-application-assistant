# Job Application Assistant

## Business Requirements

### Purpose

Replace a hand-maintained spreadsheet (`candidatures - jul.csv`) used to track job applications. The
spreadsheet's core weakness: its `Commentaire` column doubles as a free-text changelog, with dated
entries buried inside prose (`06/aug - premier entretien, bien passe. j'attends un retour le 7/aug`).
The app's job is to turn that hidden timeline into first-class data.

Single user. One person tracking their own job search. No sharing, no collaboration, ever.

### MVP scope

An application record holds:

- Job title
- Company name
- Sector
- Location
- Personal rating (1-5, half points allowed, optional)
- Comment (free text, multi-line, optional)
- Job posting link (optional)
- A list of dated status updates

### Status updates are the source of truth

An application has **no status column**. Its current status is derived from its most recent status
update. There is exactly one place to write a status change, so nothing can drift out of sync.

Consequences the implementation must honour:

- **An application always has at least one status update.** Creating an application creates its
  first update in the same transaction. There is no such thing as a statusless application, so
  deleting the last remaining update is refused with a `409`.
- `Derniere maj` from the spreadsheet does not exist as a field. It is `max(update.date)`.
- `Candidate le` does not exist as a field. It is the date of the earliest update.
- Interview rounds are not distinct statuses. Two `Interview` updates on different dates *is* a
  second round; the dates supply the ordering and the notes supply the detail.

### Status vocabulary

Six statuses, derived from the spreadsheet's `Etat` column and translated to English:

| Status      | Meaning                                        | Spreadsheet origin |
| ----------- | ---------------------------------------------- | ------------------ |
| `Contacted` | They approached you; you did not apply         | `Contact recu`     |
| `Applied`   | You sent an application                        | `Envoye`           |
| `Interview` | An interview happened (repeatable)             | `1E`, `2E`         |
| `Offer`     | An offer was made                              | -                  |
| `Rejected`  | They said no                                   | `Refus direct`     |
| `Withdrawn` | You pulled out or lost interest                | -                  |

`No apres 1E` maps to an `Interview` update followed by a `Rejected` update, which is exactly the
information the single spreadsheet value was compressing.

`Rejected` and `Withdrawn` are **closed** statuses. Everything else is **open**.

### Screens

1. **Login** - single password field.
2. **Application list** - the main screen. One row per application showing title, company, sector,
   location, rating, current status, and date of last update. Sorted by last update, most recent
   first. A single `Hide closed` toggle, on by default: a third of the existing 26 rows are already
   `Rejected` or `Withdrawn`, and they should not be the first thing seen.
3. **Application detail** - all fields, the job posting link, and the full status timeline in reverse
   chronological order. Add a status update from here; correct or delete an existing one from a
   dialog on the same screen.
4. **Create / edit application** - one form. Creating requires an initial status and its date.

Delete is available from the detail screen and cascades to that application's updates.

### Explicitly out of scope for the MVP

Do not build these. They are candidates for later increments, listed so they are not mistaken for
oversights: search, filtering beyond `Hide closed`, sorting by other columns, kanban or pipeline
board, follow-up reminders, CV/cover-letter attachments and versioning, statistics or charts, CSV
export, in-app CSV import, email or LinkedIn integration, multi-user support, salary tracking,
contact/recruiter records, tags.

### Data migration

A **one-off script**, not a shipped feature. Run once, then delete. It lives at
`backend/scripts/import_csv.py`, reads `candidatures - jul.csv`, and writes through the SQLAlchemy
models directly - not through the HTTP API. Python's `csv` module handles the quoted newlines.

The source data is hostile in specific ways the script must handle:

- **43 lines, 26 applications.** Cells contain embedded newlines inside quotes. Use a real CSV
  parser; splitting on `\n` will corrupt the data.
- **Dates have no consistent format and usually no year**: `7 Jul 2026`, `6 Jul`, `9 July`,
  `17/Jul`, `12/Aug`, `11 Aug`. Assume 2026 when the year is absent.
- **`Commentaire` contains the timeline.** Best-effort extraction of leading `<date> - <text>`
  patterns (`27/july - rdv pour le 30/07.`, `11/08 appel avec sara turgeman`) into separate status
  updates. Text that does not match stays in the comment field. Do not attempt to infer a *status*
  from the prose - import those entries with the application's `Etat`-derived status and let the
  notes carry the meaning.
- **Every application needs a first update**, dated from `Candidate le` with the status mapped from
  `Etat`. This is the one guaranteed update per row.
- **`Boite` sometimes carries two organisations**: `Alpine Consulting (client: SICPA)`,
  `Morgan Phillips Recruitment. / Castel Afrique`. Keep the raw string in `company` (see Deferred
  decisions) - do not try to split it.
- **Column 11 is unnamed** and used on exactly one row (Castel Afrique company research). Append it
  to that application's comment.
- **`secteur` has a typo**: `Cosulting` for `Consulting`. Fix on import.
- **Links are often LinkedIn URLs with heavy tracking params.** Store verbatim; do not clean.

The script must report what it could not parse rather than guessing silently. Ambiguities get fixed
by hand in the UI afterwards.

## Technical Details

### Repository layout

Two deployables in one repo, no monorepo tooling - they share no code, only an HTTP contract.

```
frontend/                 Next.js app
backend/
  app/
    main.py               FastAPI instance; the Vercel entrypoint
    config.py             settings from env
    db.py                 engine + session
    models.py             SQLAlchemy models
    schemas.py            Pydantic request/response models
    security.py           shared-secret dependency
    routers/applications.py
  alembic/                migrations
  scripts/import_csv.py   the one-off migration script
  tests/
  pyproject.toml
candidatures - jul.csv
```

### Stack

**Frontend** - Next.js (App Router) + TypeScript, Tailwind CSS, shadcn/ui. Server Components read,
Server Actions write; both call the back-end over HTTP. Zod validates form input before submit, but
the API is the authority - client-side validation is a convenience, not a guarantee. Vitest and
Playwright.

**Backend** - FastAPI on Python 3.13, `uv` for dependencies, `ruff` for lint and format. SQLAlchemy
2.0 declarative models with Alembic migrations, psycopg 3 against Neon. Pydantic v2 for request and
response models. pytest.

Endpoints are sync `def`, which FastAPI runs in a threadpool. One user makes async SQLAlchemy pure
cost: greenlet, asyncpg, and async sessions buy concurrency nobody is going to use.

### Request path

```
browser -> Next server -> FastAPI -> Neon
```

The browser never calls FastAPI. That single constraint decides several things:

- **No CORS configuration.** There is no cross-origin request to permit.
- **The session cookie is HttpOnly and Next-owned.** No token is ever readable by client JS.
- **FastAPI knows nothing about the session.** It authenticates its one caller, not a user.
- **`revalidatePath` after every mutation**, since Server Components hold the cached read.

The cost is a hop: every read is browser -> Next -> FastAPI. Accepted deliberately - see Deferred
decisions.

### API

Every route requires the `X-API-Key` header. `include_closed` drives the `Hide closed` toggle, so
the filter runs in SQL rather than dropping rows client-side.

| Method   | Path                                           | Purpose                                          |
| -------- | ---------------------------------------------- | ------------------------------------------------ |
| `GET`    | `/health`                                      | Liveness, for the local startup check            |
| `GET`    | `/applications?include_closed=`                | List with derived current status and last update |
| `POST`   | `/applications`                                | Create application + first update, one txn       |
| `GET`    | `/applications/{id}`                           | Detail with full timeline                        |
| `PATCH`  | `/applications/{id}`                           | Edit fields                                      |
| `DELETE` | `/applications/{id}`                           | Delete, cascades to updates                      |
| `POST`   | `/applications/{id}/status-updates`            | Append a status update                           |
| `PATCH`  | `/applications/{id}/status-updates/{update_id}` | Edit one timeline entry                         |
| `DELETE` | `/applications/{id}/status-updates/{update_id}` | Delete one entry, never the last                |

A status update is addressed through its application, so an update id under the wrong application is
a `404` rather than a cross-record write. Deleting an application's only update is a `409`: the
current status is derived from the timeline, so an empty one has nothing to derive from.

### Types across the boundary

Frontend request and response types are **generated** from the FastAPI OpenAPI schema with
`openapi-typescript`, into a file that is never hand-edited. Pydantic is the single source of truth;
TypeScript is downstream of it. Regenerating is a step in the build, not a thing to remember.

### Schema

```
applications
  id           uuid primary key
  title        text        not null
  company      text        not null
  sector       text        not null
  location     text        not null
  rating       real        null        -- 1.0-5.0, 0.5 steps
  comment      text        null
  link         text        null
  created_at   timestamptz not null default now()
  updated_at   timestamptz not null

status_updates
  id             uuid primary key
  application_id uuid not null references applications(id) on delete cascade
  date           date        not null   -- the day the event happened, user-set
  status         text        not null   -- Contacted | Applied | Interview | Offer | Rejected | Withdrawn
  note           text        null
  created_at     timestamptz not null default now()

index on status_updates (application_id, date desc, created_at desc)
```

`status_updates.date` is a `date`, not a timestamp. These are calendar events ("the interview was on
the 29th"), not instants, so there is no timezone to get wrong.

`rating` is `real` rather than `numeric` deliberately: half-point values are exactly representable in
binary floating point, so there is no precision concern, and it avoids `numeric` arriving as a
`Decimal` that then needs custom JSON encoding.

### Derived fields

Both are computed, never stored:

- **Current status** - the update with the greatest `date`, tie-broken by greatest `created_at`.
  Two updates can share a date (a call and a rejection on the same day), so the tiebreak is
  required, not defensive padding.
- **Last update date** - `max(date)` over the application's updates.

The list screen needs these for all applications at once. One SQLAlchemy query with a lateral join,
not a query per row. Both fields are part of the list response model, so the frontend receives them
and never derives anything itself.

### Auth

Two separate concerns that are easy to conflate:

**The user's session belongs to the frontend.** A single shared password, no user model:

- `/login` is a Server Action; it compares against `APP_PASSWORD` and sets an HttpOnly cookie
- The cookie is an HS256 JWT signed with `AUTH_SECRET` via `jose` - Edge-compatible, so no
  hand-rolled HMAC and no Node `crypto`
- `middleware.ts` rejects requests without a valid cookie and redirects to `/login`. Next 16 renames
  this file to `proxy.ts`; confirm against the installed version at scaffold time
- No registration, no password reset, no user table, no `user_id` columns

**The back-end authenticates its caller, not a user.** On Vercel the FastAPI service gets its own
public domain, so it cannot rely on being unreachable:

- Every request must carry `X-API-Key` matching `BACKEND_API_KEY`, checked in one FastAPI dependency
  with `compare_digest`
- Only the Next server holds that key. It is never sent to the browser
- FastAPI has no session, no cookie handling, and no concept of who the user is

This is sized for exactly one user and one caller. Do not generalise it.

### Environment variables

Split by service. The frontend has no database access at all.

**frontend**

| Variable           | Purpose                                     |
| ------------------ | ------------------------------------------- |
| `APP_PASSWORD`     | The single login password                   |
| `AUTH_SECRET`      | Session cookie signing secret               |
| `BACKEND_URL`      | Base URL of the FastAPI service             |
| `BACKEND_API_KEY`  | Shared secret sent as `X-API-Key`           |

**backend**

| Variable           | Purpose                                     |
| ------------------ | ------------------------------------------- |
| `DATABASE_URL`     | Neon Postgres connection string             |
| `BACKEND_API_KEY`  | Same value the frontend sends               |

### Local development

- `backend/`: `uv run fastapi dev app/main.py` on port 8000
- `frontend/`: `npm run dev` on port 3000, with `BACKEND_URL=http://localhost:8000`

Both point at the same Neon database. Use a Neon branch for development so the imported data can be
reset without touching production.

If anything that talks to Postgres hangs for a minute and then reports `server closed the connection
unexpectedly`, check whether Proton VPN is connected before debugging anything else. Its free tier
forwards only ports like 80 and 443 and black-holes 5432, while answering the TCP handshake locally so
the connection looks established. Disconnecting the VPN fixes it.
`.agents/notes/local-database-access.md` has the confirming test.

### Deployment

Two Vercel projects from the one repo, distinguished by root directory:

- **frontend** - root `frontend/`, standard Next.js preset
- **backend** - root `backend/`, Python runtime. `pyproject.toml` carries both the dependencies and
  `[tool.vercel] entrypoint = "app.main:app"`, which is what lets the service keep a normal package
  layout instead of collapsing into `api/index.py`. Python version comes from `requires-python`
- The Neon marketplace integration attaches to the **backend** project only
- `BACKEND_URL` on the frontend points at the backend project's domain

Serverless consequences to design around, not discover: use Neon's **pooled** endpoint with SQLAlchemy
`NullPool`, since connections cannot be reused across invocations. Expect a cold start of roughly a
second on the first request. No background work, no scheduled jobs, no long-lived state.

### Language

UI, labels, statuses, and code are all in **English**. Existing free-text data stays in whatever
language it was written in; do not translate user content.

### Testing focus

Nearly all the tricky logic now lives in Python, so nearly all the unit tests do too.

**pytest** - the logic that genuinely earns tests:

- Current-status derivation, including the same-date tiebreak. This is SQL, so the test needs a real
  Postgres - a dedicated Neon branch, truncated between tests. SQLite cannot stand in for it
- The import script's date normaliser, across every observed format
- The import script's timeline extraction from `Commentaire`
- The `include_closed` filter returning the right set
- API contract tests through `httpx` with `ASGITransport`, no network
- The last-remaining-update guard, and that an update cannot be edited or deleted through another
  application's id
- That editing a date does not rewrite `created_at`, so an entry edited into a same-date tie still
  resolves by original write order

**Vitest** - only where real logic exists on the frontend: status-to-colour mapping, date
formatting. Render-only components do not need tests written to reach a coverage number.

**Playwright** - login, create an application with its first status update, add a second update and
see the current status change, correct and delete a timeline entry, `Hide closed` toggle behaviour,
edit, delete. Runs against both services, which means the suite starts two processes.

## Color Scheme

Neutral zinc base with a single indigo accent. Full light and dark support; the app must be legible
in both.

Status colors are functional, not decorative:

| Status      | Colour  | Rationale                          |
| ----------- | ------- | ---------------------------------- |
| `Contacted` | Sky     | Inbound, neutral-positive          |
| `Applied`   | Zinc    | In flight, waiting                 |
| `Interview` | Amber   | Active, in progress                |
| `Offer`     | Emerald | Win                                |
| `Rejected`  | Rose    | Loss                               |
| `Withdrawn` | Muted   | Closed by choice, de-emphasised    |

Colour is never the only signal - every status badge carries its text label. Rose and emerald are
indistinguishable to a red-green colourblind reader, so the label is what actually communicates.

## Deferred decisions

Choices made unilaterally to keep the MVP minimal. Flagged here so they can be revisited rather than
rediscovered:

- **Agency vs end client is one field.** `company` is free text; `Alpine Consulting (client: SICPA)`
  goes in as-is. A separate recruiter/agency field is a later increment if the distinction starts
  mattering.
- **Sector and location are free text**, with no enum and no normalisation beyond fixing the
  `Cosulting` typo on import. The existing data has inconsistent casing (`paris` / `Paris`); it stays
  that way for now. A datalist of existing values is the cheap fix if typos become annoying.
- **No `Screening` or `Ghosted` status.** A recruiter phone call is an `Interview`; silence is
  recorded as `Rejected` with a note, matching the existing `No response within a month = Rejected`
  convention.
- **Every read crosses the network twice.** browser -> Next -> FastAPI is the price of the split
  back-end; a single Next app with direct database access would do it in one. Acceptable for one
  user on a CRUD screen. If the list ever feels slow, the fix is caching in the Next layer, not
  letting the browser talk to FastAPI directly.
- **The back-end trusts a shared static key**, with no per-request user identity. Correct while
  there is exactly one caller and the browser never reaches the API. It stops being correct the
  moment either of those changes.
- **Generated types can go stale.** `openapi-typescript` output is only as current as the last run.
  Wiring it into the build is what keeps a Pydantic change from silently passing TypeScript.
- **A status update has no route of its own.** Editing and deleting one happens in a dialog on the
  detail screen rather than at a dedicated URL, because the form is three fields. The consequence is
  that an edit is not linkable and not resumable, which for one user correcting a typo is fine.
- **An edit never rewrites `created_at`.** An entry edited onto a date it now shares with another
  still ties by original write order. Correct, but not obvious from the UI, which shows no times.

## Strategy

1. Write plan with success criteria for each phase to be checked off. Include project scaffolding, including .gitignore, and rigorous unit testing.
2. Execute the plan ensuring all critiera are met
3. Carry out extensive integration testing with Playwright or similar, fixing defects
4. Only complete when the MVP is finished and tested, with both services running and ready for the user

Build the back-end first. The frontend's generated types come from the API's OpenAPI schema, so the
API has to exist and be tested before the UI is worth writing.

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever
