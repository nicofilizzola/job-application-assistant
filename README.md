# Job Application Assistant

Tracks job applications. An application has no status column: its current status is derived from the
most recent of its dated status updates, so the timeline is the only place a status is written.

Two deployables in one repo. The browser talks only to the Next.js frontend; the frontend talks to
the FastAPI backend over HTTP. `AGENTS.md` holds the full specification.

- Frontend: https://job-application-assistant-ten.vercel.app
- Backend: https://job-application-assistant-api.vercel.app

## Setup

Copy the example env files and fill in the values. `vercel env pull` reads the deployed values, and
`neonctl connection-string <branch> --pooled` gives the database URLs.

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Point `backend/.env` at the Neon `dev` branch, never `main`. `TEST_DATABASE_URL` needs the `test`
branch: the suite truncates it between cases.

## Run

Backend on port 8000, frontend on port 3000. Both commands run from their own directory.

```bash
cd backend && uv run fastapi dev app/main.py
cd frontend && npm install && npm run dev
```

## Migrate

Alembic reads `DATABASE_URL`, so it always follows whichever branch `.env` points at. Run it from
`backend/`.

```bash
uv run alembic upgrade head
```

Changing the Pydantic models means regenerating the API schema and the types downstream of it:

```bash
cd backend && uv run python -m scripts.export_openapi
cd frontend && npm run gen:types
```

## Test

```bash
cd backend && uv run pytest && uv run ruff check .
cd frontend && npm test && npm run test:e2e
```

The Playwright suite starts both services itself on ports 3100 and 8100, and empties the test
database before and after.

## Deploy

Both projects deploy from the repository root, because the frontend build reads
`backend/openapi.json`. Their root directories are set on Vercel.

```bash
vercel deploy --prod --project job-application-assistant-api
vercel deploy --prod --project job-application-assistant
```

`DATABASE_URL` belongs to the backend project only. The frontend holds `APP_PASSWORD`,
`AUTH_SECRET`, `BACKEND_URL` and `BACKEND_API_KEY`.
