# AI Match: Short Summary and Two Columns - Implementation Plan

> **For agentic workers:** use the `executing-plans` skill to work through this plan task by task.
> Steps use checkbox (`- [ ]`) syntax for tracking. Tick them as you go.

**Goal:** Replace the AI match's single three-sentence paragraph with a 210-character summary plus
two side-by-side columns - `What matches well` and `Weaknesses` - each carrying one to four terse
bullet points.

**Architecture:** `match_summary` keeps its column and its meaning narrows to a short summary. Two
new nullable `text[]` columns, `match_strengths` and `match_weaknesses`, carry the bullets. They
travel the same path the existing AI fields already travel: written by `ApplicationCreate` and by
`POST /applications/{id}/match`, absent from `ApplicationPatch`, and produced by the one OpenAI call
in `app/ai.py`. On the frontend one new presentational component, `MatchPanel`, renders the whole
block and is used twice: on the detail screen, and on the create form as a preview of an analysis
that has not been saved yet.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2, `openai` Python SDK (Responses API
with `text_format` parsing), pytest (backend); Next.js 16 App Router, Server Actions, Tailwind,
shadcn/ui, Playwright (frontend).

**Spec:** `AGENTS.md`. Read it before starting. It still describes the match as a "three-sentence
justification" in six places; Task 6 rewrites them. Until then the spec and this plan disagree on
purpose, and the plan wins.

## Decisions closed before planning

| Question                                              | Answer                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| Show the match on the create form before saving?      | Yes. The same block the detail screen shows, read-only, under the AI mode box |
| What may the `Weaknesses` column name?                | Skills and background only - never location, language, visa, salary, remote policy. The same axis the score is on |
| Enforce 210 characters and four bullets in Python?     | No. The limits live in the prompt only; nothing trims or counts the model's answer |
| Existing three-sentence summaries in the database      | Left alone. They render in the short-summary slot until that application is re-scored |

## Decisions taken while planning

Technical, reversible, and flagged so they can be revisited rather than rediscovered.

| Decision                                                | Reason                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| Postgres `text[]`, not JSONB                             | The value is a list of strings and nothing more. `Mapped[list[str] \| None]` over `ARRAY(Text)` needs no serialisation layer, and psycopg round-trips it natively |
| `match_summary` is reused, not renamed                   | Its meaning narrows from "three sentences" to "210 characters"; the column, the schema field and the generated TypeScript name all stay put, so nothing outside the prompt and the UI has to change |
| Column names mirror the UI labels                        | `match_strengths` -> `What matches well`, `match_weaknesses` -> `Weaknesses`. One less mapping to hold in your head; the label is prose, the column is a name |
| One `MatchPanel` component, used twice                   | The detail screen and the create-form preview must not drift apart. It is presentational, has no `"use client"` and no server-only import, so a client component can import it |
| The lists cross the form as repeated hidden inputs       | `formData.getAll("match_strengths")` rebuilds the array. No JSON encoding in a hidden input, so nothing to parse or escape |
| Nothing new in Vitest                                    | `AGENTS.md` limits Vitest to real frontend logic - status colours, date formatting. `MatchPanel` is render-only and the hidden-input round trip needs both services, so Playwright covers it. This is deliberate, not an oversight |

## Global Constraints

Copied from `AGENTS.md`. Every task's requirements implicitly include these.

- **No emojis anywhere in the repo.** Not in code, comments, commits, or docs.
- UI, labels, statuses and code are in **English**. Existing free-text data is never translated.
- Keep it simple. No over-engineering, no unnecessary defensive programming, no extra features.
- The browser never calls FastAPI. Every read and write goes browser -> Next -> FastAPI.
- Every FastAPI route except `/health` requires a matching `X-API-Key`.
- `revalidatePath` after every mutation, because Server Components hold the cached read.
- `frontend/src/lib/api-types.ts` is **generated** and never hand-edited. `backend/openapi.json` is
  committed and regenerated whenever a Pydantic model changes.
- Backend is Python 3.13 run through `uv`, linted and formatted with `ruff`, line length 100.
- `pytest`, `alembic` and `scripts/export_openapi.py` all run **from `backend/`** - `env_file=".env"`
  resolves against the working directory.
- Spelling follows the repo's existing register: `analyse`, `colour`, `summarise`.
- Commit messages: imperative sentence-case title, body paragraphs saying why, and the trailer
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. No `feat:` prefixes - the
  repo does not use them.

## Before you start

- [ ] Branch off `main`: `git switch -c ai-match-columns`
- [ ] `git status` already shows `M .gitignore`, `M skills-lock.json` and untracked
      `.agents/skills/writing-plans/` and `.claude/skills/writing-plans/`. None of it belongs to this
      work. Every commit step below uses an explicit `git add <paths>`; never `git add -A`.
- [ ] Confirm the baseline is green before changing anything:
      `cd backend && uv run pytest` - **90 tests pass**. Then `cd frontend && npm test`.
      Every backend task below says how many tests it adds, checkable against that 90.
- [ ] If anything that talks to Postgres hangs for a minute and then reports `server closed the
      connection unexpectedly`, disconnect Proton VPN before debugging anything else. Its free tier
      black-holes port 5432 while answering the handshake locally. See
      `.agents/notes/local-database-access.md`.

## File Structure

| File                                              | Responsibility                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| `backend/app/models.py`                           | Modify: `match_strengths` and `match_weaknesses` columns on `Application` |
| `backend/app/schemas.py`                          | Modify: the two fields on `JobAnalysis`, `ApplicationCreate`, `ApplicationDetail`. `ApplicationPatch` stays untouched, deliberately |
| `backend/alembic/versions/<generated>.py`         | Create: the migration adding two nullable `text[]` columns            |
| `backend/app/ai.py`                               | Modify: `SCORING` asks for the new shape, `NO_PROFILE` nulls it, `STUB` returns it |
| `backend/app/routers/applications.py`             | Modify: `score_match` writes the two new fields                       |
| `backend/tests/conftest.py`                       | Modify: `stub_analyser` returns the two new fields                    |
| `backend/tests/test_applications.py`              | Modify: create, patch and no-match tests cover the two new fields     |
| `backend/tests/test_analysis.py`                  | Modify: analyse and re-score tests cover them; one new test on list replacement |
| `backend/openapi.json`                            | Regenerate: committed, and the source of the frontend's types         |
| `frontend/src/lib/api-types.ts`                   | Regenerate: never hand-edited                                         |
| `frontend/src/components/match-panel.tsx`         | Create: the whole match block - rating, summary, two columns          |
| `frontend/src/app/applications/[id]/page.tsx`     | Modify: render `MatchPanel` instead of the inline paragraph           |
| `frontend/src/components/application-form.tsx`    | Modify: preview `MatchPanel` after an analysis; hidden inputs for both lists |
| `frontend/src/app/applications/actions.ts`        | Modify: `readAiFields` reads both lists off the form                  |
| `frontend/e2e/ai-mode.spec.ts`                    | Modify: assert the block on the detail screen and on the create form  |
| `AGENTS.md`                                       | Modify: the six passages that still say "three-sentence justification" |

---

### Task 1: Store the two new columns

Nothing here knows about OpenAI. This task only proves the API can accept two lists of strings, hand
them back, and refuse to let a hand edit touch them.

> **Correction, made during execution.** Tasks 1 and 2 land as **one commit**. Task 1 alone leaves
> the backend unable to import: `app/ai.py` builds `STUB = JobAnalysis(...)` at module level, the two
> new fields are required on `JobAnalysis`, and `tests/conftest.py` imports `app.ai` - so pytest
> collects zero tests and `fastapi dev` will not start until Task 2 Step 6 fixes `STUB`. There is no
> green intermediate state to gate on, so Task 1 ends without a test run and without a commit, and
> Task 2's Step 9 commits both tasks together.

**Files:**
- Modify: `backend/app/models.py:26-27`
- Modify: `backend/app/schemas.py:42-48` (`JobAnalysis`), `:101-107` (`ApplicationCreate`),
  `:142-160` (`ApplicationDetail`)
- Create: `backend/alembic/versions/<generated>.py`
- Test: `backend/tests/test_applications.py:463-511`

**Interfaces:**
- Produces: `Application.match_strengths` and `Application.match_weaknesses`, both
  `Mapped[list[str] | None]`. The same two names as `list[str] | None` fields on `JobAnalysis`
  (required, no default), `ApplicationCreate` (defaulting to `None`) and `ApplicationDetail`
  (required). Task 2 writes them, Task 3 exports them, Tasks 4 and 5 render them.

- [x] **Step 1: Write the failing tests**

In `backend/tests/test_applications.py`, replace the three existing AI-field tests
(`test_create_stores_the_ai_fields`, `test_an_application_created_by_hand_has_no_match`,
`test_patch_cannot_touch_the_ai_fields`) with these, and add the fourth:

```python
async def test_create_stores_the_ai_fields(client):
    application_id = await create(
        client,
        job_ad="Full Stack Software Engineer. Remote, Sweden.",
        match_rating=3.5,
        match_summary="Strong stack overlap, no fintech background.",
        match_strengths=["Python and FastAPI", "Six years full stack"],
        match_weaknesses=["No fintech domain"],
    )

    detail = (await client.get(f"/applications/{application_id}")).json()
    assert detail["job_ad"] == "Full Stack Software Engineer. Remote, Sweden."
    assert detail["match_rating"] == 3.5
    assert detail["match_summary"] == "Strong stack overlap, no fintech background."
    assert detail["match_strengths"] == ["Python and FastAPI", "Six years full stack"]
    assert detail["match_weaknesses"] == ["No fintech domain"]


async def test_an_application_created_by_hand_has_no_match(client):
    application_id = await create(client)

    detail = (await client.get(f"/applications/{application_id}")).json()
    assert detail["job_ad"] is None
    assert detail["match_rating"] is None
    assert detail["match_summary"] is None
    assert detail["match_strengths"] is None
    assert detail["match_weaknesses"] is None


async def test_create_keeps_an_empty_match_list_empty(client):
    """A 5/5 match can genuinely have nothing worth naming as a weakness."""
    application_id = await create(client, match_rating=5.0, match_weaknesses=[])

    detail = (await client.get(f"/applications/{application_id}")).json()
    assert detail["match_weaknesses"] == []


async def test_patch_cannot_touch_the_ai_fields(client):
    application_id = await create(
        client,
        match_rating=3.5,
        match_summary="Original.",
        match_strengths=["Original strength"],
        match_weaknesses=["Original weakness"],
    )

    response = await client.patch(
        f"/applications/{application_id}",
        json={
            "title": "Renamed",
            "match_rating": 5,
            "match_summary": "Talked up.",
            "match_strengths": ["Invented strength"],
            "match_weaknesses": [],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Renamed"
    assert body["match_rating"] == 3.5
    assert body["match_summary"] == "Original."
    assert body["match_strengths"] == ["Original strength"]
    assert body["match_weaknesses"] == ["Original weakness"]
```

Why the patch test sends `"match_weaknesses": []` rather than another list: an empty list is the
value most likely to slip past a naive `if value:` guard, and `ApplicationPatch` has no field for it
at all, so Pydantic must drop it either way.

- [x] **Step 2: Run the tests to verify they fail**

```bash
cd backend && uv run pytest tests/test_applications.py -k "ai_fields or no_match or empty_match" -v
```

Expected: FAIL. `test_create_stores_the_ai_fields` fails on `KeyError: 'match_strengths'` or a 422,
because `ApplicationCreate` has no such field yet.

- [x] **Step 3: Add the columns to the model**

In `backend/app/models.py`, extend the import on line 4 with `ARRAY`:

```python
from sqlalchemy import ARRAY, REAL, CheckConstraint, Date, DateTime, ForeignKey, Index, Text, func
```

Then, directly after `match_summary` on line 27:

```python
    # Always assigned a whole new list, never mutated in place: SQLAlchemy does not track
    # in-place changes to an ARRAY column, so `application.match_strengths.append(...)` would
    # never reach the database.
    match_strengths: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    match_weaknesses: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
```

- [x] **Step 4: Add the fields to the schemas**

In `backend/app/schemas.py`, `JobAnalysis` becomes:

```python
class JobAnalysis(BaseModel):
    """What one model call returns. Also the response body of POST /job-ads/analyse.

    The match fields are null when there is no profile to score against. No defaults: OpenAI's
    strict structured outputs require every property to be required, and nullability is how
    "absent" is expressed. The 210-character summary and the four-entry lists are prompt rules,
    not constraints here - a length limit in this model would turn a chatty model into a 500.
    """

    title: str
    company: str
    sector: str
    location: str
    match_rating: float | None
    match_summary: str | None
    match_strengths: list[str] | None
    match_weaknesses: list[str] | None
```

In `ApplicationCreate`, after `match_summary`:

```python
    match_strengths: list[str] | None = None
    match_weaknesses: list[str] | None = None
```

In `ApplicationDetail`, after `match_summary`:

```python
    match_strengths: list[str] | None
    match_weaknesses: list[str] | None
```

Leave `ApplicationPatch` exactly as it is. That absence is the feature, and
`test_patch_cannot_touch_the_ai_fields` is what holds it in place.

- [x] **Step 5: Generate the migration**

```bash
cd backend && uv run alembic revision --autogenerate -m "Add match strengths and weaknesses"
```

Open the generated file and check it against this, keeping the generated
`# ### commands auto generated by Alembic` comments that the two existing migrations also keep:

```python
revision: str = "<generated>"
down_revision: str | Sequence[str] | None = "0cb29f7e3b12"


def upgrade() -> None:
    """Upgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.add_column("applications", sa.Column("match_strengths", sa.ARRAY(sa.Text()), nullable=True))
    op.add_column("applications", sa.Column("match_weaknesses", sa.ARRAY(sa.Text()), nullable=True))
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_column("applications", "match_weaknesses")
    op.drop_column("applications", "match_strengths")
    # ### end Alembic commands ###
```

`sa.ARRAY(sa.Text())` may come out as `postgresql.ARRAY(sa.TEXT())`; either is fine as long as both
columns are nullable text arrays and `down_revision` is `"0cb29f7e3b12"`. If autogenerate emits
anything else - a dropped table, a changed type - your dev database is behind: run
`uv run alembic upgrade head` first, delete the bad revision file, and generate again.

- [x] **Step 6: Apply the migration to both databases**

Development first:

```bash
cd backend && uv run alembic upgrade head
```

Then the test branch, because the suite and Playwright both run against `TEST_DATABASE_URL`:

```bash
cd backend && DATABASE_URL="$(grep '^TEST_DATABASE_URL=' .env | cut -d= -f2-)" uv run alembic upgrade head
```

In PowerShell instead:

```powershell
cd backend
$env:DATABASE_URL = (Select-String '^TEST_DATABASE_URL=' .env).Line.Split('=', 2)[1]
uv run alembic upgrade head
Remove-Item Env:\DATABASE_URL
```

- [x] **Step 7: Stop here - do not run the suite and do not commit**

At this point `JobAnalysis` requires two fields that `STUB` in `app/ai.py` does not pass, so
`import app.ai` raises `ValidationError` and pytest cannot even collect. That is expected and is
fixed by Task 2 Step 6. Go straight to Task 2; its Step 7 is the first real gate and its Step 9 is
the commit for both tasks.

---

### Task 2: Teach the prompt and the stub the new shape

**Files:**
- Modify: `backend/app/ai.py:28-51` (`NO_PROFILE`, `SCORING`), `:78-85` (`STUB`)
- Modify: `backend/app/routers/applications.py:124-127`
- Modify: `backend/tests/conftest.py:98-105`
- Test: `backend/tests/test_analysis.py`

**Interfaces:**
- Consumes: `JobAnalysis.match_strengths` and `JobAnalysis.match_weaknesses`, both
  `list[str] | None`, from Task 1.
- Produces: `STUB` in `backend/app/ai.py` gains `match_strengths=["Stubbed strength", "Another
  stubbed point"]` and `match_weaknesses=["Stubbed weakness"]`. Task 5's Playwright assertions match
  those exact strings. The `stub_analyser` fixture accepts `match_strengths=` and
  `match_weaknesses=` overrides.

- [x] **Step 1: Write the failing tests**

In `backend/tests/test_analysis.py`, replace the four tests below with these versions and add
`test_rescoring_replaces_the_lists_rather_than_adding_to_them`:

```python
async def test_analyse_returns_the_extracted_fields(client, stub_analyser):
    stub_analyser()

    response = await client.post("/job-ads/analyse", json={"text": ADVERT})

    assert response.status_code == 200
    assert response.json() == {
        "title": "Full stack engineer",
        "company": "BJAK",
        "sector": "Insurtech",
        "location": "Sweden",
        "match_rating": 3.5,
        "match_summary": "Strong stack overlap, no insurtech domain.",
        "match_strengths": ["Python and FastAPI", "Six years full stack"],
        "match_weaknesses": ["No insurtech domain"],
    }


async def test_analyse_without_a_profile_passes_an_empty_string(client, stub_analyser):
    calls = stub_analyser(
        match_rating=None, match_summary=None, match_strengths=None, match_weaknesses=None
    )

    response = await client.post("/job-ads/analyse", json={"text": ADVERT})

    assert calls == [(ADVERT, "")]
    body = response.json()
    assert body["match_rating"] is None
    assert body["match_summary"] is None
    assert body["match_strengths"] is None
    assert body["match_weaknesses"] is None


async def test_scoring_writes_the_match_onto_the_application(client, stub_analyser):
    calls = stub_analyser(
        match_rating=4.5,
        match_summary="Reassessed against a fuller profile.",
        match_strengths=["Ships LLM features in production"],
        match_weaknesses=["No Kubernetes"],
    )
    await client.put("/profile", json={"content": "Nicolas, engineer."})
    application_id = await create(
        client,
        job_ad=ADVERT,
        match_rating=2.0,
        match_summary="Old.",
        match_strengths=["Old strength"],
        match_weaknesses=["Old weakness"],
    )

    response = await client.post(f"/applications/{application_id}/match")

    assert response.status_code == 200
    body = response.json()
    assert body["match_rating"] == 4.5
    assert body["match_summary"] == "Reassessed against a fuller profile."
    assert body["match_strengths"] == ["Ships LLM features in production"]
    assert body["match_weaknesses"] == ["No Kubernetes"]
    assert calls == [(ADVERT, "Nicolas, engineer.")]


async def test_rescoring_replaces_the_lists_rather_than_adding_to_them(client, stub_analyser):
    """The columns are replaced wholesale. A shorter answer must shorten them, not merge in."""
    stub_analyser(match_strengths=["Only this one"], match_weaknesses=["Only this gap"])
    await client.put("/profile", json={"content": "Nicolas, engineer."})
    application_id = await create(
        client,
        job_ad=ADVERT,
        match_strengths=["First", "Second", "Third"],
        match_weaknesses=["First gap", "Second gap"],
    )

    body = (await client.post(f"/applications/{application_id}/match")).json()

    assert body["match_strengths"] == ["Only this one"]
    assert body["match_weaknesses"] == ["Only this gap"]


async def test_scoring_without_a_profile_is_409(client, stub_analyser):
    stub_analyser()
    application_id = await create(
        client, job_ad=ADVERT, match_rating=2.0, match_strengths=["Kept"]
    )

    response = await client.post(f"/applications/{application_id}/match")

    assert response.status_code == 409
    # The refusal has to leave the old score alone, or an empty profile would erase history.
    detail = (await client.get(f"/applications/{application_id}")).json()
    assert detail["match_rating"] == 2.0
    assert detail["match_strengths"] == ["Kept"]
```

- [x] **Step 2: Run the tests to verify they fail**

```bash
cd backend && uv run pytest tests/test_analysis.py -v
```

Expected: FAIL. The stub fixture builds a `JobAnalysis` without the two new fields, so every test in
the file errors with a Pydantic `ValidationError: 2 validation errors for JobAnalysis`.

- [x] **Step 3: Update the stub fixture**

In `backend/tests/conftest.py`, the `JobAnalysis` built inside `_install` becomes:

```python
        answer = JobAnalysis(
            title=fields.get("title", "Full stack engineer"),
            company=fields.get("company", "BJAK"),
            sector=fields.get("sector", "Insurtech"),
            location=fields.get("location", "Sweden"),
            match_rating=fields.get("match_rating", 3.5),
            match_summary=fields.get("match_summary", "Strong stack overlap, no insurtech domain."),
            match_strengths=fields.get(
                "match_strengths", ["Python and FastAPI", "Six years full stack"]
            ),
            match_weaknesses=fields.get("match_weaknesses", ["No insurtech domain"]),
        )
```

The old default summary was `"Three sentences would go here."`, which no longer describes anything.

- [x] **Step 4: Write the two new fields in the re-score route**

In `backend/app/routers/applications.py`, inside `score_match`, replace the two assignment lines:

```python
    analysis = analyser(application.job_ad, profile)
    application.match_rating = analysis.match_rating
    application.match_summary = analysis.match_summary
    application.match_strengths = analysis.match_strengths
    application.match_weaknesses = analysis.match_weaknesses
    session.flush()
    return application
```

`create_application` needs no change: it already does
`payload.model_dump(exclude={"first_update"})`, so the new fields flow through untouched.

- [x] **Step 5: Rewrite the prompt**

In `backend/app/ai.py`, replace `NO_PROFILE` and `SCORING` with:

```python
NO_PROFILE = """There is no candidate profile available, so leave match_rating, match_summary,
match_strengths and match_weaknesses null. Do not guess a score."""

SCORING = """Score the match on skills and background alone: technical stack, domain experience,
seniority, and what the candidate has actually shipped. Ignore location, remote policy, salary,
visa status, language requirements and personal preference - those are the candidate's call, not
yours, and must not move the score.

Use this scale, in half points:

- 1 - almost no overlap with what the advert asks for
- 2 - a few relevant skills, most requirements unmet
- 3 - meets roughly half the requirements
- 4 - meets most requirements, gaps are minor
- 5 - meets or exceeds essentially every requirement

Put the score in match_rating, then justify it across three fields:

- match_summary: why the score is that value, in 210 characters or fewer. One or two sentences.
- match_strengths: what the candidate brings that this advert asks for. One to four entries.
- match_weaknesses: what this advert asks for that the candidate lacks. Skills and background
  only - never location, language, visa, salary or remote policy, for the same reason those do
  not move the score. One to four entries.

Give each list only as many entries as there are things worth naming: one sharp point beats four
padded ones. Never make the same point in both lists.

Write all three fields in stripped-down language. List entries are fragments, not sentences:
"Six years shipping FastAPI", not "The candidate has six years of experience shipping FastAPI
services". No leading dashes, no full stop ending an entry, no hedging ("appears to", "seems"),
no filler ("strong candidate", "good fit", "overall"), and never write "the candidate" - who is
being described is already understood.

Here is the candidate:

<candidate_profile>
{profile}
</candidate_profile>"""
```

- [x] **Step 6: Update the stub answer**

In `backend/app/ai.py`, `STUB` becomes:

```python
STUB = JobAnalysis(
    title="Stubbed Engineer",
    company="Stub Industries",
    sector="Testing",
    location="Nowhere",
    match_rating=3.5,
    match_summary="A fixed answer, so the end-to-end suite never calls OpenAI.",
    # Two on one side and one on the other, so the end-to-end suite proves the columns fill
    # independently. No entry is a substring of another: Playwright's getByText would match both.
    match_strengths=["Stubbed strength", "Another stubbed point"],
    match_weaknesses=["Stubbed weakness"],
)
```

- [x] **Step 7: Run the tests to verify they pass**

```bash
cd backend && uv run pytest
```

Expected: 92 tests pass - the 90 from the baseline plus Task 1's
`test_create_keeps_an_empty_match_list_empty` and this task's
`test_rescoring_replaces_the_lists_rather_than_adding_to_them`. This is the first suite run since
Task 1 started, and the first point at which the backend can import at all.

- [x] **Step 8: Lint and format**

```bash
cd backend && uv run ruff format . && uv run ruff check .
```

- [x] **Step 9: Commit both tasks**

One commit, because Task 1's schema change and this task's `STUB` are the same atomic change as far
as `import app.ai` is concerned. Note the explicit paths: `.agents/plans/` carries the plan file,
which is new, but nothing else from that directory.

```bash
git add backend/app/models.py backend/app/schemas.py backend/alembic/versions \
        backend/app/ai.py backend/app/routers/applications.py \
        backend/tests/conftest.py backend/tests/test_applications.py \
        backend/tests/test_analysis.py .agents/plans/17-08-2026-ai-match-columns.md
git commit -m "$(cat <<'EOF'
Ask the model for a short summary and two lists

The match justification was one three-sentence paragraph. It becomes a short
summary plus two lists - what fits and what does not - so the detail screen can
show them as columns instead of prose.

match_summary keeps its column and narrows in meaning. The two lists are
nullable text[]: the value is a list of strings and nothing more, so ARRAY(Text)
needs no serialisation layer. Neither field appears on ApplicationPatch, which
keeps the whole match AI-owned exactly as the rating already was.

The prompt now asks for a 210-character summary, up to four things that fit, and
up to four that do not, all in fragments rather than sentences, with the filler
and hedging named explicitly so the columns stay scannable. The weaknesses list
is held to skills and background, the same axis the score is on: a 5/5 match
should never carry a bullet about visas when visas cannot move the number. Those
limits are prompt rules only - nothing in Python trims or counts the answer,
because a clipped sentence reads as a bug and a length constraint on JobAnalysis
would turn a chatty model into a 500.

The schema change and the stub land together: JobAnalysis requires the two new
fields, app/ai.py builds STUB at import, and conftest imports it, so splitting
them would mean a commit whose backend cannot start.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Regenerate the OpenAPI schema and the TypeScript types

Neither file is written by hand. This task exists on its own so the two generated artefacts land in
one reviewable commit, and so Tasks 4 and 5 can rely on the types being there.

**Files:**
- Regenerate: `backend/openapi.json`
- Regenerate: `frontend/src/lib/api-types.ts`

**Interfaces:**
- Consumes: the Pydantic changes from Tasks 1 and 2.
- Produces: `components["schemas"]["ApplicationDetail"]` and `["JobAnalysis"]` each carry
  `match_strengths: string[] | null` and `match_weaknesses: string[] | null`;
  `["ApplicationCreate"]` carries both as `string[] | null` optional properties. Tasks 4 and 5 read
  these through the existing `ApplicationDetail` and `JobAnalysis` aliases in
  `frontend/src/lib/api.ts`.

- [x] **Step 1: Export the schema**

```bash
cd backend && uv run python -m scripts.export_openapi
```

- [x] **Step 2: Generate the types**

```bash
cd frontend && npm run gen:types
```

- [x] **Step 3: Verify both fields arrived**

```bash
cd frontend && grep -n "match_strengths" src/lib/api-types.ts
```

Expected: at least three hits - one each inside `ApplicationCreate`, `ApplicationDetail` and
`JobAnalysis`. If there are none, `backend/openapi.json` was not re-exported; run Step 1 again from
`backend/`, not from the repo root.

- [x] **Step 4: Check the frontend still compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS. Nothing reads the new fields yet, and adding properties to a response type breaks
nothing.

- [x] **Step 5: Commit**

```bash
git add backend/openapi.json frontend/src/lib/api-types.ts
git commit -m "$(cat <<'EOF'
Regenerate the API schema and the frontend types

Both files are generated: openapi.json comes from scripts.export_openapi and
api-types.ts from openapi-typescript. Committed separately so the diff is
reviewable as machine output rather than mixed into hand-written code.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Render the match panel on the detail screen

> **Correction, made during execution.** Step 5 cannot pass inside this task. Its assertions read the
> two columns off the detail screen of an application created through AI mode, but nothing carries the
> lists from the analysis into `POST /applications` until Task 5 Steps 4 and 5 add the hidden inputs
> and `optionalList`. Until then a record created that way has `match_strengths` and
> `match_weaknesses` null, so `MatchColumn` correctly renders nothing. The component and the detail
> screen were verified against an application created directly through the API with both lists set:
> the region, the rating, the summary and both `<h3>` columns all render as asserted. Task 5's Step 6,
> which runs the whole suite, is the real gate for these assertions.
>
> **Resolution.** The spec edit moves to Task 5's commit; this task commits only the component and
> the detail screen. So every commit on the branch stays green: the spec as committed here is the old
> one, whose `3.5 / 5` and `A fixed answer` assertions the new panel satisfies unchanged. This also
> matches the repo's own habit of landing end-to-end coverage in its own commit, as `27386be`
> ("Cover AI mode end to end against a stubbed analyser") did.

**Files:**
- Create: `frontend/src/components/match-panel.tsx`
- Modify: `frontend/src/app/applications/[id]/page.tsx:61-71`
- Test: `frontend/e2e/ai-mode.spec.ts:37-59`

**Interfaces:**
- Consumes: `ApplicationDetail.match_strengths` / `.match_weaknesses` as `string[] | null` from
  Task 3, and the `STUB` strings from Task 2.
- Produces: `MatchPanel`, exported from `frontend/src/components/match-panel.tsx`:

  ```tsx
  export function MatchPanel(props: {
    rating: number;
    summary: string | null;
    strengths: string[] | null;
    weaknesses: string[] | null;
  }): React.JSX.Element;
  ```

  It renders a `<section aria-label="AI match">`, so Playwright can scope with
  `getByRole("region", { name: "AI match" })`, and each column title is an `<h3>`, so
  `getByRole("heading", { name: "What matches well" })` works. Task 5 reuses it unchanged.

- [x] **Step 1: Write the failing assertions**

In `frontend/e2e/ai-mode.spec.ts`, replace the tail of `test("AI mode fills the form from a pasted
advert")` - the four lines from `await page.getByRole("button", { name: "Create application"
}).click();` onwards - with:

```ts
  await page.getByRole("button", { name: "Create application" }).click();

  await expect(page.getByRole("heading", { name: "Stubbed Engineer" })).toBeVisible();
  const match = page.getByRole("region", { name: "AI match" });
  await expect(match.getByText("3.5 / 5")).toBeVisible();
  await expect(match.getByText("A fixed answer")).toBeVisible();
  await expect(match.getByRole("heading", { name: "What matches well" })).toBeVisible();
  await expect(match.getByText("Stubbed strength")).toBeVisible();
  await expect(match.getByText("Another stubbed point")).toBeVisible();
  await expect(match.getByRole("heading", { name: "Weaknesses" })).toBeVisible();
  await expect(match.getByText("Stubbed weakness")).toBeVisible();
  await expect(page.getByText("Job advert")).toBeVisible();
```

- [x] **Step 2: Run it to verify it fails**

```bash
cd frontend && npx playwright test ai-mode -g "fills the form"
```

Expected: FAIL on the `getByRole("region", { name: "AI match" })` assertion - no element has that
accessible name yet. The run builds the frontend and starts both services, so allow a few minutes.
If it fails earlier with `TEST_DATABASE_URL is not set in backend/.env`, or with a database error
about `match_strengths`, Task 1 Step 6 was not run against the test branch.

- [x] **Step 3: Write the component**

Create `frontend/src/components/match-panel.tsx`:

```tsx
/** The AI match, rendered the same way in both places it appears: on the detail screen, and on the
 *  create form as a preview of an analysis that has not been saved yet. Presentational only, with
 *  no "use client" and no server-only import, so a client component can import it too. */
export function MatchPanel({
  rating,
  summary,
  strengths,
  weaknesses,
}: {
  rating: number;
  summary: string | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
}) {
  // Boolean(), not a bare `||`: React renders a literal 0 for `strengths?.length` when it is empty.
  const hasColumns = Boolean(strengths?.length || weaknesses?.length);

  return (
    <section aria-label="AI match" className="space-y-3 rounded-lg border p-4">
      <div>
        <p className="text-sm text-muted-foreground">AI match</p>
        <p className="text-lg font-medium">{rating} / 5</p>
      </div>
      {summary && <p className="text-sm break-words">{summary}</p>}
      {hasColumns && (
        <div className="grid gap-4 sm:grid-cols-2">
          <MatchColumn title="What matches well" items={strengths} />
          <MatchColumn title="Weaknesses" items={weaknesses} />
        </div>
      )}
    </section>
  );
}

/** An empty column is a real state, not an error: a 5/5 match can have no weakness worth naming,
 *  and a score written before this screen existed has no lists at all. */
function MatchColumn({ title, items }: { title: string; items: string[] | null }) {
  if (!items?.length) return null;

  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm marker:text-muted-foreground">
        {items.map((item, index) => (
          <li key={index} className="break-words">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [x] **Step 4: Use it on the detail screen**

In `frontend/src/app/applications/[id]/page.tsx`, add to the imports, keeping them alphabetical:

```tsx
import { MatchPanel } from "@/components/match-panel";
```

Then replace the whole `application.match_rating != null` block (lines 61-71) with:

```tsx
        {application.match_rating != null && (
          <MatchPanel
            rating={application.match_rating}
            summary={application.match_summary}
            strengths={application.match_strengths}
            weaknesses={application.match_weaknesses}
          />
        )}
```

The `!= null` guard stays as it is: the panel takes `rating: number`, and an application with no
match has nothing to show.

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd frontend && npx playwright test ai-mode
```

Expected: all four tests in the file pass. `scoring is refused while the profile is empty` still
asserts `getByText("3.5 / 5")` unscoped, which now resolves inside the panel - one element, so no
strict-mode violation.

- [x] **Step 6: Check types and lint**

```bash
cd frontend && npx tsc --noEmit && npm run lint && npm test
```

Expected: all PASS. `npm test` is Vitest and is unchanged by this task - `MatchPanel` is
render-only, which `AGENTS.md` explicitly says not to write a test for.

- [x] **Step 7: Commit**

`frontend/e2e/ai-mode.spec.ts` is deliberately left out and stays dirty for Task 5, per the
correction above. Do not `git add` it here.

```bash
git add frontend/src/components/match-panel.tsx \
        "frontend/src/app/applications/[id]/page.tsx" \
        .agents/plans/17-08-2026-ai-match-columns.md
git commit -m "$(cat <<'EOF'
Show the AI match as a summary and two columns

The detail screen rendered the justification as one paragraph. It now shows the
short summary above a two-column split - what matches well, and weaknesses -
which is far quicker to scan than prose and makes the score's reasoning legible
at a glance.

The block lives in its own component because the create form shows the same
thing before saving, and the two must not drift apart. A column with no entries
renders nothing: a 5/5 match may have no weakness worth naming, and scores
written before this change have no lists at all.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Review the match on the create form before saving

The analysis currently disappears into hidden inputs and only surfaces after the application is
created. With the columns in place it is worth reading while deciding whether the record is even
worth keeping, so the same panel renders under the AI mode box.

**Files:**
- Modify: `frontend/src/components/application-form.tsx:42` and `:131-137`
- Modify: `frontend/src/app/applications/actions.ts:63-71`
- Test: `frontend/e2e/ai-mode.spec.ts:37-59`

**Interfaces:**
- Consumes: `MatchPanel` from Task 4, and `JobAnalysis.match_strengths` / `.match_weaknesses` as
  `string[] | null` from Task 3.
- Produces: `POST /applications` bodies carrying `match_strengths` and `match_weaknesses` as
  `string[] | null`, read off the form by `readAiFields`.

- [x] **Step 1: Write the failing assertions**

In `frontend/e2e/ai-mode.spec.ts`, in `test("AI mode fills the form from a pasted advert")`, the
existing block that asserts the form was filled becomes:

```ts
  // The form is empty and the paste box is not offered until AI mode is on.
  await expect(page.getByLabel("Job advert")).toBeHidden();
  await expect(page.getByRole("region", { name: "AI match" })).toBeHidden();
  await page.getByLabel("AI mode").click();
  await page.getByLabel("Job advert").fill(ADVERT);
  await page.getByRole("button", { name: "Fill the form" }).click();

  await expect(page.getByLabel("Job title")).toHaveValue("Stubbed Engineer");
  await expect(page.getByLabel("Company")).toHaveValue("Stub Industries");
  await expect(page.getByLabel("Sector")).toHaveValue("Testing");
  await expect(page.getByLabel("Location")).toHaveValue("Nowhere");
  await expect(page.getByLabel("Date")).not.toHaveValue("");

  // Reviewable before anything is written: the same block the detail screen shows.
  const preview = page.getByRole("region", { name: "AI match" });
  await expect(preview.getByText("3.5 / 5")).toBeVisible();
  await expect(preview.getByRole("heading", { name: "What matches well" })).toBeVisible();
  await expect(preview.getByText("Stubbed strength")).toBeVisible();
  await expect(preview.getByText("Another stubbed point")).toBeVisible();
  await expect(preview.getByRole("heading", { name: "Weaknesses" })).toBeVisible();
  await expect(preview.getByText("Stubbed weakness")).toBeVisible();
```

- [x] **Step 2: Run it to verify it fails**

```bash
cd frontend && npx playwright test ai-mode -g "fills the form"
```

Expected: FAIL on `preview.getByText("3.5 / 5")` - the create form renders no panel yet. The
`toBeHidden()` assertion before the toggle passes already, for the same reason.

- [x] **Step 3: Render the preview on the form**

In `frontend/src/components/application-form.tsx`, add to the imports:

```tsx
import { MatchPanel } from "@/components/match-panel";
```

Then, immediately after the `{creating && <JobAdAnalyser onAnalysed={applyAnalysis} />}` line:

```tsx
      {analysis?.match_rating != null && (
        <MatchPanel
          rating={analysis.match_rating}
          summary={analysis.match_summary}
          strengths={analysis.match_strengths}
          weaknesses={analysis.match_weaknesses}
        />
      )}
```

It sits outside the `<form key={prefillKey}>`, so remounting the inputs on a fresh analysis does not
depend on it, and it disappears again if the next analysis comes back unscored.

- [x] **Step 4: Carry both lists through the form**

Still in `frontend/src/components/application-form.tsx`, the hidden-input block becomes:

```tsx
        {prefill && (
          <>
            <input type="hidden" name="job_ad" value={prefill.adText} />
            <input type="hidden" name="match_rating" value={analysis?.match_rating ?? ""} />
            <input type="hidden" name="match_summary" value={analysis?.match_summary ?? ""} />
            {/* One input per entry, so formData.getAll rebuilds the list on the server. */}
            {(analysis?.match_strengths ?? []).map((item, index) => (
              <input key={index} type="hidden" name="match_strengths" value={item} />
            ))}
            {(analysis?.match_weaknesses ?? []).map((item, index) => (
              <input key={index} type="hidden" name="match_weaknesses" value={item} />
            ))}
          </>
        )}
```

- [x] **Step 5: Read the lists in the Server Action**

In `frontend/src/app/applications/actions.ts`, add this helper directly below `optional`:

```ts
/** Repeated hidden inputs. An absent list and an empty one both mean "nothing to show", and the
 *  UI renders them identically, so both arrive as null. */
function optionalList(formData: FormData, name: string): string[] | null {
  const items = formData
    .getAll(name)
    .map((value) => String(value).trim())
    .filter(Boolean);
  return items.length === 0 ? null : items;
}
```

Then `readAiFields` becomes:

```ts
/** Hidden fields, written by AI mode only. Absent on a hand-filled form. */
function readAiFields(formData: FormData) {
  const matchRating = optional(formData, "match_rating");
  return {
    job_ad: optional(formData, "job_ad"),
    match_rating: matchRating === null ? null : Number(matchRating),
    match_summary: optional(formData, "match_summary"),
    match_strengths: optionalList(formData, "match_strengths"),
    match_weaknesses: optionalList(formData, "match_weaknesses"),
  };
}
```

There is no Zod schema for these and there should not be: they are not user input, they never reach
`applicationSchema`, and the API is the authority on them. That matches how `job_ad` and
`match_rating` are already handled.

- [x] **Step 6: Run the tests to verify they pass**

```bash
cd frontend && npx playwright test
```

Expected: the whole end-to-end suite passes, not just `ai-mode`. Run it all here because the create
form is shared with the edit screen, which `applications.spec.ts` drives.

- [x] **Step 7: Check types and lint**

```bash
cd frontend && npx tsc --noEmit && npm run lint && npm test
```

Expected: all PASS.

- [x] **Step 8: Commit**

```bash
git add frontend/src/components/application-form.tsx frontend/src/app/applications/actions.ts \
        frontend/e2e/ai-mode.spec.ts
git commit -m "$(cat <<'EOF'
Show the match on the create form before saving

The analysis went straight into hidden inputs, so the score and its reasoning
were invisible until the application had already been created. The two columns
are exactly what you want while deciding whether a record is worth keeping, so
the create form now renders the same panel the detail screen does.

The two lists cross the form as one hidden input per entry and are rebuilt with
formData.getAll, which avoids encoding JSON into an input value. An empty list
arrives as null: the two are indistinguishable once rendered.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Bring the spec up to date

`AGENTS.md` is the spec every later change argues from, and six of its passages still describe a
three-sentence paragraph. This task is documentation only - no code, no tests.

**Files:**
- Modify: `AGENTS.md` (MVP scope, Screens 3 and 4, Schema, Testing focus, Deferred decisions)

- [x] **Step 1: Update the MVP scope bullet**

Under `### MVP scope`, replace:

```markdown
- An AI match rating (1-5, half points) and its three-sentence justification (optional)
```

with:

```markdown
- An AI match rating (1-5, half points), a summary of at most 210 characters, and two lists of one
  to four short entries each - what matches well, and weaknesses (optional)
```

- [x] **Step 2: Update Screens 3 and 4**

Under `### Screens`, in item 3, replace `the AI match and its justification` with:

```markdown
the AI match - its rating, its short summary, and its strengths and weaknesses columns -
```

In item 4, replace the AI mode sentence:

```markdown
   An `AI mode` toggle on the create form takes a pasted job advert, fills the fields in from it, and
   scores the match. Every field stays editable and nothing is written until the form is submitted.
```

with:

```markdown
   An `AI mode` toggle on the create form takes a pasted job advert, fills the fields in from it, and
   scores the match, showing the same match block the detail screen does so the score can be read
   before saving. Every field stays editable and nothing is written until the form is submitted.
```

- [x] **Step 3: Update the schema block**

Under `### Schema`, in the `applications` table, replace these three lines:

```
  job_ad       text       null        -- the advert as pasted, when AI mode created the record
  match_rating  real       null        -- 1.0-5.0, 0.5 steps, written by AI only
  match_summary text       null        -- three sentences justifying match_rating
```

with:

```
  job_ad       text       null        -- the advert as pasted, when AI mode created the record
  match_rating  real       null        -- 1.0-5.0, 0.5 steps, written by AI only
  match_summary text       null        -- at most 210 characters, justifying match_rating
  match_strengths  text[]  null        -- up to four short entries: what fits
  match_weaknesses text[]  null        -- up to four short entries: what does not
```

- [x] **Step 4: Update the testing focus**

Under `### Testing focus`, in the **pytest** list, replace:

```markdown
- That `ApplicationPatch` cannot write `match_rating`, `match_summary` or `job_ad`
```

with:

```markdown
- That `ApplicationPatch` cannot write `job_ad` or any of the four AI match fields
- That re-scoring replaces both match lists wholesale rather than adding to them
```

- [x] **Step 5: Update the deferred decisions**

Under `## Deferred decisions`, replace:

```markdown
- **The match is AI-owned and read-only.** `ApplicationCreate` accepts the three AI fields and
  `ApplicationPatch` has no field for any of them, so a score cannot be hand-tuned. The cost is that
  a wrong score can only be replaced by re-scoring, never corrected or cleared.
```

with:

```markdown
- **The match is AI-owned and read-only.** `ApplicationCreate` accepts the five AI fields and
  `ApplicationPatch` has no field for any of them, so a score cannot be hand-tuned. The cost is that
  a wrong score can only be replaced by re-scoring, never corrected or cleared.
- **The 210-character summary and the four-entry columns are prompt rules, not validated limits.**
  Nothing in Python trims or counts what the model returns, so a model that ignores the instruction
  produces a long summary or a fifth entry and the UI renders it. Chosen over silent truncation
  because a clipped sentence reads as a bug; if it turns out to happen, clamping in `app/ai.py`
  alongside `half_step` is the fix.
```

- [x] **Step 6: Check nothing else went stale**

```bash
cd "C:/Users/Nicolas FILIZZOLA/dev-workspace/job-application-assistant" && grep -rn "three-sentence\|three sentences" --include="*.md" --include="*.py" --include="*.tsx" --include="*.ts" .
```

Expected: no hits outside `.agents/plans/`, which is a historical record and is not edited.

- [x] **Step 7: Commit**

```bash
git add AGENTS.md
git commit -m "$(cat <<'EOF'
Describe the match as a summary and two columns

Six passages in the spec still described the match justification as three
sentences of prose. The schema block, the MVP scope, both affected screens, the
pytest focus list and the AI-ownership decision now match what ships.

One new deferred decision records that the 210-character and four-entry limits
live in the prompt only, and what to do if a model starts ignoring them.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Done when

- [ ] `cd backend && uv run pytest` - 92 tests pass
- [ ] `cd backend && uv run ruff check .` - clean
- [ ] `cd frontend && npx tsc --noEmit && npm run lint && npm test` - all pass
- [ ] `cd frontend && npx playwright test` - the whole suite passes
- [ ] The migration is applied to both the development and the test database
- [ ] `git status` shows no unexpected files staged, and the four pre-existing dirty paths
      (`.gitignore`, `skills-lock.json`, `.agents/skills/writing-plans/`,
      `.claude/skills/writing-plans/`) are still untouched
- [ ] Manual check with a real advert and a real profile, both services running, `AI_STUB` unset:
      create an application through AI mode and confirm the summary is short, the entries are
      fragments rather than sentences, and neither column runs past four. This is the only step that
      exercises the actual prompt - everything above it runs against the stub
