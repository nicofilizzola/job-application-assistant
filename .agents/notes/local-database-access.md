# Local database access: Neon is unreachable on port 5432

**First observed:** 15 August 2026, while executing `.agents/plans/14-08-2026-edit-application-timeline.md`.
**Status when written:** still broken. Worked around, not fixed.

## The symptom

Anything that speaks the Postgres wire protocol to Neon from the development machine hangs for about
a minute and then fails:

```
psycopg.OperationalError: connection failed: connection to server at "3.215.191.145", port 5432
failed: server closed the connection unexpectedly
```

This hits `uv run pytest`, `uv run fastapi dev`, `alembic`, and the Playwright suite - everything
except the frontend's own unit tests. `pytest` does not fail fast; it sits there. A run was left
hanging for twelve minutes before being killed.

Both Neon branches are affected (`DATABASE_URL` and `TEST_DATABASE_URL`), and both the pooled and the
direct endpoint hosts.

## It is not Neon, and it is not a credentials problem

This is the important part, because the error message reads like the server is broken. It is not.
The Neon project is healthy and serving. Two things establish that:

**1. HTTPS to the same host works.** Port 443 on the compute endpoint connects instantly and answers.

**2. Neon's SQL-over-HTTP endpoint returns real query results.** This is the fastest way to prove the
database is alive and your connection string is valid, since it uses the same credentials over 443:

```bash
cd backend && .venv/Scripts/python.exe -c "
import os, json, urllib.request
from urllib.parse import urlsplit
from dotenv import load_dotenv
load_dotenv()
url = os.environ['TEST_DATABASE_URL']          # or DATABASE_URL
host = urlsplit(url).hostname
req = urllib.request.Request(
    f'https://{host}/sql',
    data=json.dumps({'query': 'select count(*) from applications', 'params': []}).encode(),
    headers={'Content-Type': 'application/json', 'Neon-Connection-String': url},
)
print(urllib.request.urlopen(req, timeout=30).read().decode()[:300])
"
```

If that returns rows, the database is fine and the problem is the network path to 5432.

## What the network is actually doing

The TCP handshake to port 5432 **succeeds** in about 0.3 seconds. What fails is everything after it.
Sending the 8-byte Postgres SSLRequest gets either an immediate connection reset or nothing at all
until timeout. Sending arbitrary junk bytes on the same port behaves identically.

That last detail matters: because *any* payload dies, this is not deep packet inspection singling out
the Postgres protocol. It looks like a middlebox that completes the handshake and then black-holes
the connection - a corporate firewall, a VPN, or an ISP-level block on 5432.

Reproduce it with:

```bash
cd backend && .venv/Scripts/python.exe -c "
import socket, time
host = 'ep-green-dew-augahxwe-pooler.c-10.us-east-1.aws.neon.tech'
t = time.time()
s = socket.create_connection((host, 5432), timeout=15); s.settimeout(15)
print('tcp connect ok in', round(time.time() - t, 2), 's')
s.sendall((8).to_bytes(4, 'big') + (80877103).to_bytes(4, 'big'))   # Postgres SSLRequest
try:
    print('reply:', s.recv(1))          # a healthy Neon proxy answers b'S'
except Exception as e:
    print('no reply:', type(e).__name__)
s.close()
"
```

Healthy looks like `reply: b'S'`. Broken looks like `no reply: ConnectionResetError` or
`no reply: TimeoutError`.

## The workaround: a local Postgres container

The spec requires a real Postgres for the test suite - SQLite cannot stand in, because the
current-status derivation is a lateral join. So run one locally.

```bash
docker run -d --name jaa-test-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=neondb \
  -p 55432:5432 postgres:17-alpine

cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:55432/neondb" uv run alembic upgrade head
```

Port 55432 deliberately, to avoid colliding with any local Postgres on the default port. No volume,
so the data dies with the container - which is what you want for a scratch test database. No restart
policy either, so after a reboot bring it back with `docker start jaa-test-pg`.

This is a faithful substitute, not a compromise: the untouched 45-test baseline passed against it
before any new code was written, and the suite runs in ~3 seconds rather than waiting on Neon.

### Running pytest against it

Override the variable for the one command. `conftest.py` calls `load_dotenv()`, which does not
override real environment variables, so the shell value wins:

```bash
cd backend
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:55432/neondb" uv run pytest -q
```

### Running Playwright against it

**`playwright.config.ts` reads `backend/.env` off disk, not the environment.** Setting the variable in
the shell does nothing. You have to edit that line in the file, run the suite, and put the Neon value
back afterwards. Back the file up first - it is gitignored, so a mistake is not recoverable from git:

```bash
cd backend && cp .env .env.neon-backup
# edit TEST_DATABASE_URL to postgresql://postgres:postgres@localhost:55432/neondb
cd ../frontend && npx playwright test
cd ../backend && mv .env.neon-backup .env      # restore, and verify the host is back to Neon
```

Forgetting the restore is the real hazard here. Check it explicitly afterwards.

## Unrelated Windows snag you will hit at the same time

`uv run fastapi dev app/main.py` crashes on startup when its output is redirected to a file:

```
UnicodeEncodeError: 'charmap' codec can't encode characters in position 1-2
```

The FastAPI CLI prints an emoji banner through `rich`, and a redirected stream on Windows encodes as
cp1252. Nothing to do with the database or with our code. Prefix the command:

```bash
PYTHONIOENCODING=utf-8 uv run fastapi dev app/main.py --port 8000
```

## What is not affected

- **Production.** Vercel reaches Neon normally. Deployments and the live app are unaffected.
- **`vercel` CLI, `git`, `npm`.** All HTTPS.
- **Frontend Vitest, eslint, tsc.** No database involved.
- **Reading production data for a sanity check.** The SQL-over-HTTP snippet above works, and the
  deployed API can be queried over HTTPS with the `X-API-Key` header.

## Retiring the workaround

Check whether it is fixed by running the suite without the override:

```bash
cd backend && uv run pytest -q
```

If that passes, 5432 is reachable again and the container is dead weight:

```bash
docker rm -f jaa-test-pg
```

Until then, keep it. It costs nothing while stopped.

## Root cause: still unknown

Not investigated, because it is outside the repository. Candidates, cheapest first:

- A VPN or corporate firewall doing egress filtering on 5432. Try toggling the VPN, or tethering to a
  phone hotspot - if it works there, it is the network, not the machine.
- ISP-level blocking of database ports, which some consumer ISPs do.
- A local security product intercepting outbound connections.

A Neon IP allow list would produce a different failure (a clear error, not a black hole), and would
not explain HTTPS on 443 working from the same machine, so it is unlikely - but it is worth a glance
at the project settings if the network angles come up empty.

Note that this blocks local development against real data, not just testing: `fastapi dev` cannot
reach the Neon dev branch either. Worth fixing properly rather than living on the container.
