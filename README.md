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

`OPENAI_API_KEY` is needed for AI mode, which reads a pasted job advert and scores it against the
profile written at `/profile`, and folds plain-English updates into that profile. The test suites
never call OpenAI, but the backend builds its client at import, so the variable has to be set for
anything to start.

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

Pushing to `main` deploys. `.github/workflows/ci.yml` runs ruff, pytest, eslint, tsc, Vitest and the
Playwright suite; if all of them pass it migrates the production database, deploys the backend, then
deploys the frontend. A push to any other branch runs the same checks and deploys nothing.

Both projects deploy from the repository root, because the frontend build reads
`backend/openapi.json`. Their root directories are set on Vercel. To deploy by hand anyway:

```bash
vercel deploy --prod --project job-application-assistant-api
vercel deploy --prod --project job-application-assistant
```

`DATABASE_URL` and `OPENAI_API_KEY` belong to the backend project only. The frontend holds
`APP_PASSWORD`, `AUTH_SECRET`, `BACKEND_URL` and `BACKEND_API_KEY`.

The pipeline needs six repository secrets: `TEST_DATABASE_URL` and `PROD_DATABASE_URL`,
`VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID_API` and `VERCEL_PROJECT_ID_WEB`. The login
password, the auth secret and the API key used in CI are throwaway literals in the workflow file:
both services under test are local to the runner. Vercel's own Git integration is disconnected on
both projects, so that a push is not deployed twice.
