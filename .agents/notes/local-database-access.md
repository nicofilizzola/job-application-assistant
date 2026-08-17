# Local database access: Proton VPN blocks port 5432

**First observed:** 15 August 2026, while executing `.agents/plans/14-08-2026-edit-application-timeline.md`.
**Root cause found:** 17 August 2026.
**Status:** fixed. Disconnect Proton VPN before running anything that talks to Postgres.

## Root cause

Proton VPN's free tier forwards only a small set of destination ports - 80 and 443 among them - and
black-holes the rest, including 5432. Its client stack answers the TCP handshake locally, so a
connection appears to establish and then nothing ever comes back.

Nothing was wrong with Neon, the credentials, the ISP, or the code. `Ethernet 4` / `Ethernet 5`
(FortiClient) were a red herring: both were disconnected throughout.

## The symptom

Anything speaking the Postgres wire protocol to Neon hangs for about a minute, then:

```
psycopg.OperationalError: connection failed: connection to server at "3.215.191.145", port 5432
failed: server closed the connection unexpectedly
```

This hits `uv run pytest`, `uv run fastapi dev`, `alembic`, and the Playwright suite. `pytest` does
not fail fast; it sits there. Frontend Vitest, eslint, and `tsc` are unaffected - no database.

## Confirming it in five seconds

Check the tunnel, not the database:

```bash
powershell -c "Get-NetAdapter -IncludeHidden | Where-Object Name -eq ProTUN"
```

The `ProTUN` adapter exists **only while Proton VPN is connected** - which is why it is invisible in a
healthy `Get-NetAdapter` listing, and why the VPN is easy to overlook as a suspect. If it is there,
disconnect Proton VPN and try again.

## Why it looked like a broken server

Three details sent the first investigation down the wrong path. All three are explained by the
handshake being answered locally rather than by Neon:

- **The TCP handshake "succeeded" in 0.3s**, so the network looked fine and the server looked broken.
  It was a phantom connection; there was never a session to break.
- **Arbitrary junk bytes died exactly like a Postgres SSLRequest**, which ruled out deep packet
  inspection - correctly - and pointed at a middlebox. The drop is by port, so payload is irrelevant.
- **HTTPS to the same host worked**, and so did Neon's SQL-over-HTTP endpoint. Port 443 is on the
  allowed list.

## The test that identifies it

Connect to a port where **nothing is listening**. With the tunnel down the connect times out; with it
up the connect "succeeds", which is only possible if something local is answering:

```bash
cd backend && .venv/Scripts/python.exe -c "
import socket, time
host = 'ep-green-dew-augahxwe-pooler.c-10.us-east-1.aws.neon.tech'
for port in (5432, 5433, 443):        # 5433 has nothing behind it
    t = time.time()
    try:
        socket.create_connection((host, port), timeout=10).close()
        print(port, 'connect ok in', round(time.time() - t, 2), 's')
    except Exception as e:
        print(port, type(e).__name__, 'after', round(time.time() - t, 2), 's')
"
```

Healthy: 5432 and 443 connect, 5433 times out. Tunnelled: all three "connect", and 5432 then
black-holes. `portquiz.net` accepts connections on every port and makes the same point about any
host - `:80` answers through the tunnel, `:5432` does not.

## What is not affected

- **Production.** Vercel reaches Neon normally.
- **`vercel` CLI, `git`, `npm`, and the deployed API.** All HTTPS.
- **Reading Neon over HTTPS**, if you ever need data while tunnelled:

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

## If 5432 is ever blocked by a network you cannot change

A local Postgres container is a faithful substitute - the full suite passed against one while this was
being worked around, in ~3 seconds rather than ~2 minutes:

```bash
docker run -d --name jaa-test-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=neondb \
  -p 55432:5432 postgres:17-alpine

cd backend
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:55432/neondb" uv run alembic upgrade head
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:55432/neondb" uv run pytest -q
```

Port 55432 avoids colliding with a local Postgres on the default port, and no volume means the data
dies with the container. `conftest.py` calls `load_dotenv()`, which does not override real
environment variables, so the shell value wins.

Playwright is the awkward one: **`playwright.config.ts` reads `backend/.env` off disk, not the
environment**, so you have to edit the file and put it back afterwards. It is gitignored, so back it
up first - `cp .env .env.neon-backup` - and check the restore explicitly.

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
