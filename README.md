# Job Application Assistant

Tracks job applications. An application has no status column: its current status is derived from the
most recent of its dated status updates, so the timeline is the only place a status is written.

Two deployables in one repo. The browser talks only to the Next.js frontend; the frontend talks to
the FastAPI backend over HTTP. `AGENTS.md` holds the full specification.

## Setup

Copy the example env files and fill in the values:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

## Run

Backend on port 8000:

```bash
cd backend
uv run fastapi dev app/main.py
```

Frontend on port 3000:

```bash
cd frontend
npm install
npm run dev
```
