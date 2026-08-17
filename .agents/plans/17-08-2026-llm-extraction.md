# AI Mode: Job Advert Extraction and Match Scoring - Implementation Plan

> **For agentic workers:** use the `executing-plans` skill to work through this plan task by task.
> Steps use checkbox (`- [ ]`) syntax for tracking. Tick them as you go.

**Goal:** Paste a job advert into the new-application form and have OpenAI fill in the fields and
score how well the job matches the candidate's profile, with the result reviewable before saving.

**Architecture:** One OpenAI call, made by FastAPI, returns the advert's fields and an optional match
score in a single structured object. The candidate profile it scores against lives in a one-row
`profile` table edited from a new screen. Applications gain three AI-owned columns - `job_ad`,
`match_rating`, `match_summary` - writable at create time and by a re-score endpoint, but absent from
`ApplicationPatch` so hand edits can never touch them. The frontend keeps its uncontrolled form and
re-applies defaults by remounting on a key when an analysis arrives.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2, `openai` Python SDK (Responses API
with `text_format` parsing), pytest (backend); Next.js 16 App Router, Server Actions, shadcn/ui,
Zod, Vitest, Playwright (frontend).

**Spec:** `AGENTS.md`. Read it before starting. It currently describes an app with **no AI at all**,
and its "Explicitly out of scope for the MVP" list is silent on this feature because it predates it.
Task 13 rewrites the six passages that go stale. Until then the spec and this plan disagree on
purpose, and the plan wins.

## Decisions closed before planning

| Question                                  | Answer                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| Where the candidate profile lives         | A one-row `profile` table, edited from a new `/profile` screen          |
| What happens to the pasted advert         | Stored in a new `applications.job_ad` column, shown on the detail screen |
| Match rating and justification            | AI-owned and read-only: never in the create or edit form                |
| What else AI mode prefills                | The first status update: `Applied`, dated today. Not the link           |
| AI mode when the profile is empty         | Extract the fields, leave the match null, say why in the UI             |
| Re-scoring an existing application        | Yes: a button on the detail screen, using the stored advert             |
| Match score on the list screen            | Yes, shown next to the personal rating and labelled `AI`                |
| Playwright and OpenAI                     | Stubbed. The backend swaps in a fixed analyser when `AI_STUB` is set    |

## Decisions taken while planning

These were not asked about. They are technical, reversible, and flagged so they can be revisited.

| Decision                                       | Reason                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| The OpenAI call lives in **FastAPI**, not Next | `backend/.env.example` already carries `OPENAI_API_KEY`; the logic is Python, like the prototype; the browser still never reaches an API key |
| Plain `openai` SDK, **not LangChain**          | One dependency instead of four, and a smaller serverless cold start. The prototype's LCEL pipe buys nothing for a single call |
| **One** model call, not the notebook's three   | The notebook reformats, extracts, then scores. In production that is three round trips behind one spinner. One call returning one object is faster and is the whole of `app/ai.py` |
| The advert is stored **as pasted**, unformatted | Dropping the Markdown-tidying call is what makes the above true. The detail screen renders it with `whitespace-pre-line` inside a collapsed `<details>`, so the raw paste is never in your face |
| The rating is **snapped** to a half point in Python | OpenAI's strict structured outputs do not reliably honour numeric `minimum`/`maximum`/`enum`. One `round(x * 2) / 2` guarantees the contract the database column promises |

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

- [ ] Branch off `main`: `git switch -c llm-extraction`
- [ ] `git status` will already show `M .gitignore`, `M backend/.env.example`, `M skills-lock.json`
      and untracked `.agents/skills/`, `.claude/skills/` and `local-testing/` paths. Most are
      unrelated to this work. Every commit step below uses an explicit `git add <paths>`; never
      `git add -A`, or those get swept in.
- [ ] Confirm the baseline is green before changing anything: `cd backend && uv run pytest`, then
      `cd frontend && npm test`. **Write the backend test count down** - every backend task below
      says how many tests it adds, and those numbers are checkable against this baseline.
- [ ] Put a real key in `backend/.env` as `OPENAI_API_KEY=sk-...`. The suite never calls OpenAI, but
      `app/ai.py` constructs the client at import, so the variable must be present and non-empty.

## File Structure

| File                                              | Responsibility                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `backend/app/config.py`                           | Modify: `openai_api_key`, `openai_model`, `ai_stub`                 |
| `backend/app/models.py`                           | Modify: `Profile` model, three columns on `Application`             |
| `backend/app/schemas.py`                          | Modify: `JobAdText`, `JobAnalysis`, `ProfileRead`, `ProfileWrite`, new fields on create/read models |
| `backend/app/ai.py`                               | Create: the OpenAI call, the half-point snap, the analyser dependency and its stub |
| `backend/app/routers/profile.py`                  | Create: `GET`/`PUT /profile` and the `load_content` helper          |
| `backend/app/routers/job_ads.py`                  | Create: `POST /job-ads/analyse`                                     |
| `backend/app/routers/applications.py`             | Modify: `POST /applications/{id}/match`, `match_rating` on the list  |
| `backend/app/main.py`                             | Modify: mount the two new routers                                   |
| `backend/alembic/versions/<generated>.py`         | Create: the migration                                               |
| `backend/tests/conftest.py`                       | Modify: truncate `profile` too; a `stub_analyser` fixture           |
| `backend/tests/test_ai.py`                        | Create: the half-point snap                                         |
| `backend/tests/test_profile.py`                   | Create: profile round-trip and single-row behaviour                 |
| `backend/tests/test_analysis.py`                  | Create: `/job-ads/analyse` and `/applications/{id}/match`           |
| `backend/tests/test_applications.py`              | Modify: route inventory, auth list, AI fields on create/patch/list   |
| `backend/openapi.json`                            | Regenerate                                                          |
| `backend/pyproject.toml`                          | Modify: add `openai`                                                |
| `backend/vercel.json`                             | Modify: `maxDuration`                                               |
| `backend/.env.example`                            | Modify: document the three new variables                            |
| `frontend/src/lib/api-types.ts`                   | Regenerate                                                          |
| `frontend/src/lib/api.ts`                         | Modify: `getProfile`, `putProfile`, `analyseJobAd`, `scoreMatch`     |
| `frontend/src/lib/format.ts`                      | Modify: `todayIso`                                                  |
| `frontend/src/lib/format.test.ts`                 | Modify: `todayIso` cases                                            |
| `frontend/src/app/profile/page.tsx`               | Create: the profile screen                                          |
| `frontend/src/app/profile/profile-form.tsx`       | Create: its client form                                             |
| `frontend/src/app/profile/actions.ts`             | Create: `saveProfileAction`                                         |
| `frontend/src/app/applications/actions.ts`        | Modify: `analyseJobAdAction`, `scoreMatchAction`, AI fields on create |
| `frontend/src/components/job-ad-analyser.tsx`     | Create: the AI mode toggle, paste box, and loading state            |
| `frontend/src/components/application-form.tsx`    | Modify: hold the analysis, remount on it, carry hidden fields        |
| `frontend/src/components/score-match-button.tsx`  | Create: the re-score button                                         |
| `frontend/src/components/app-header.tsx`          | Modify: a `Profile` link                                            |
| `frontend/src/app/applications/[id]/page.tsx`     | Modify: match block, stored advert, re-score button                 |
| `frontend/src/app/page.tsx`                       | Modify: the `AI` badge on each row                                  |
| `frontend/playwright.config.ts`                   | Modify: `AI_STUB` on the backend process                            |
| `frontend/e2e/ai-mode.spec.ts`                    | Create: the end-to-end cases                                        |
| `AGENTS.md`                                       | Modify: six passages that go stale                                  |
| `README.md`                                       | Modify: the new environment variables                               |

---

## Task 1: Schema and configuration

Columns and settings first, so every later task has somewhere to write.

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/app/models.py`
- Modify: `backend/tests/conftest.py:37`
- Modify: `backend/.env.example`
- Modify: `backend/pyproject.toml`
- Create: `backend/alembic/versions/<generated>.py`

**Interfaces:**
- Produces: `Profile` model with `PROFILE_ID = 1`; `Application.job_ad`, `Application.match_rating`,
  `Application.match_summary`; `settings.openai_api_key`, `settings.openai_model`,
  `settings.ai_stub`.

- [ ] **Step 1: Add the dependency**

```bash
cd backend && uv add openai
```

- [ ] **Step 2: Extend the settings**

In `backend/app/config.py`, add three fields to `Settings`:

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    backend_api_key: str
    openai_api_key: str
    openai_model: str = "gpt-5.5"
    # Swaps the OpenAI call for a fixed answer. Playwright sets it: the analyse request is made
    # server-side, so the browser has nothing to intercept and the seam has to live here.
    ai_stub: bool = False
```

- [ ] **Step 3: Add the model changes**

In `backend/app/models.py`, import `CheckConstraint` from `sqlalchemy`, add the three columns to
`Application` immediately after `link`:

```python
    link: Mapped[str | None] = mapped_column(Text)
    # Written by AI mode and by the re-score route, never by a hand edit: ApplicationPatch
    # deliberately has no field for any of them.
    job_ad: Mapped[str | None] = mapped_column(Text)
    match_rating: Mapped[float | None] = mapped_column(REAL)
    match_summary: Mapped[str | None] = mapped_column(Text)
```

and add the `Profile` model after `StatusUpdate`:

```python
PROFILE_ID = 1


class Profile(Base):
    """The candidate's own background, scored against. One user, so exactly one row."""

    __tablename__ = "profile"
    __table_args__ = (CheckConstraint(f"id = {PROFILE_ID}", name="profile_is_one_row"),)

    id: Mapped[int] = mapped_column(primary_key=True, default=PROFILE_ID)
    content: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), onupdate=func.now()
    )
```

- [ ] **Step 4: Generate the migration**

```bash
cd backend && uv run alembic revision --autogenerate -m "Add profile and AI match fields"
```

Open the generated file. It must contain exactly these operations - delete anything else autogenerate
invented, and keep the generated `revision` and `down_revision` values untouched:

```python
def upgrade() -> None:
    op.create_table(
        "profile",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("id = 1", name="profile_is_one_row"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.add_column("applications", sa.Column("job_ad", sa.Text(), nullable=True))
    op.add_column("applications", sa.Column("match_rating", sa.REAL(), nullable=True))
    op.add_column("applications", sa.Column("match_summary", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("applications", "match_summary")
    op.drop_column("applications", "match_rating")
    op.drop_column("applications", "job_ad")
    op.drop_table("profile")
```

All three columns are nullable, which is what "leave it empty for already existing records" means:
the 26 imported applications keep `NULL` in every one and no backfill runs.

- [ ] **Step 5: Apply it to both databases**

```bash
cd backend && uv run alembic upgrade head
```

Then again against the test branch, because the suite runs on `TEST_DATABASE_URL`:

```bash
cd backend && DATABASE_URL="$TEST_DATABASE_URL" uv run alembic upgrade head
```

If `$TEST_DATABASE_URL` is not exported in your shell, copy the value out of `backend/.env`.

- [ ] **Step 6: Truncate the new table between tests**

`backend/tests/conftest.py:37` currently reads `truncate applications cascade`. A profile written by
one test would otherwise leak into the next and change what the analyser is handed:

```python
        connection.execute(text("truncate applications, profile cascade"))
```

- [ ] **Step 7: Document the variables**

Replace `backend/.env.example` entirely - the current file has `OPENAI_API_KEY` glued to the end of
the previous line:

```
DATABASE_URL=
BACKEND_API_KEY=
OPENAI_API_KEY=

# Optional. Defaults to gpt-5.5.
OPENAI_MODEL=

# Only the test suite reads this. Point it at a throwaway branch: tests truncate between cases.
TEST_DATABASE_URL=

# Only Playwright sets this. Replaces the OpenAI call with a fixed answer.
AI_STUB=
```

- [ ] **Step 8: Verify nothing regressed**

Run: `cd backend && uv run pytest`
Expected: the same count as the baseline, all passing. No new tests yet - this task only adds
columns nothing reads.

- [ ] **Step 9: Commit**

```bash
git add backend/app/config.py backend/app/models.py backend/alembic/versions \
        backend/tests/conftest.py backend/.env.example backend/pyproject.toml backend/uv.lock
git commit -m "Add the profile table and the AI match columns

The candidate profile the match is scored against needs somewhere to live that
does not require a redeploy to edit, so it gets its own one-row table rather
than a file in the repo. Applications gain job_ad, match_rating and
match_summary, all nullable: every application that exists today predates AI
mode and stays empty.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: The OpenAI call

The only file in the repo that knows OpenAI exists.

**Files:**
- Modify: `backend/app/schemas.py`
- Create: `backend/app/ai.py`
- Create: `backend/tests/test_ai.py`

**Interfaces:**
- Consumes: `settings.openai_api_key`, `settings.openai_model`, `settings.ai_stub` from Task 1.
- Produces: `JobAnalysis` (Pydantic, in `schemas.py`); `analyse(ad_text: str, profile: str) ->
  JobAnalysis`; `Analyser` type alias; `get_analyser() -> Analyser`; `AnalyserDep`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_ai.py`:

```python
import pytest

from app.ai import half_step


@pytest.mark.parametrize(
    ("returned", "expected"),
    [
        (4.0, 4.0),
        (3.5, 3.5),
        (3.7, 3.5),
        (3.8, 4.0),
        (0.5, 1.0),
        (7.0, 5.0),
        (None, None),
    ],
)
def test_a_rating_is_snapped_onto_the_half_point_scale(returned, expected):
    assert half_step(returned) == expected
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd backend && uv run pytest tests/test_ai.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'app.ai'`.

- [ ] **Step 3: Add the schemas**

In `backend/app/schemas.py`, after the `Rating` alias:

```python
class JobAdText(BaseModel):
    text: str = Field(min_length=1)


class JobAnalysis(BaseModel):
    """What one model call returns. Also the response body of POST /job-ads/analyse.

    The match fields are null when there is no profile to score against. No defaults: OpenAI's
    strict structured outputs require every property to be required, and nullability is how
    "absent" is expressed.
    """

    title: str
    company: str
    sector: str
    location: str
    match_rating: float | None
    match_summary: str | None
```

- [ ] **Step 4: Write the implementation**

Create `backend/app/ai.py`:

```python
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends
from openai import OpenAI

from app.config import settings
from app.schemas import JobAnalysis

client = OpenAI(api_key=settings.openai_api_key)

SYSTEM = (
    "You read job adverts for a single job seeker. You extract the advert's facts and, when a "
    "candidate profile is given, score how well that candidate matches the job. Report what the "
    "advert says and never invent a detail it does not state."
)

FIELDS = """Pull these fields out of the advert:

- title: the job title, as the advert states it.
- company: the employer. If an agency posted it for a client, name the employer the role is for.
- sector: the company's industry in one to three words - insurance, fintech, public sector - not
  what the role does day to day.
- location: "City, Country". If the advert names no city, give the country on its own.

Answer in English, translating the advert's wording where it is in another language."""

NO_PROFILE = """There is no candidate profile available, so leave match_rating and match_summary
null. Do not guess a score."""

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

Put the score in match_rating and explain it in match_summary in exactly three sentences: what
fits, what does not, and what tipped it to that value rather than the half point above or below.

Here is the candidate:

<candidate_profile>
{profile}
</candidate_profile>"""


def half_step(rating: float | None) -> float | None:
    """The scale is 1 to 5 in half points and the column trusts that. The model is only asked."""
    if rating is None:
        return None
    return min(5.0, max(1.0, round(rating * 2) / 2))


def analyse(ad_text: str, profile: str) -> JobAnalysis:
    task = NO_PROFILE if not profile.strip() else SCORING.format(profile=profile)
    response = client.responses.parse(
        model=settings.openai_model,
        input=[
            {"role": "system", "content": SYSTEM},
            {
                "role": "user",
                "content": f"{FIELDS}\n\n{task}\n\n<job_advert>\n{ad_text}\n</job_advert>",
            },
        ],
        text_format=JobAnalysis,
    )
    analysis = response.output_parsed
    return analysis.model_copy(update={"match_rating": half_step(analysis.match_rating)})


STUB = JobAnalysis(
    title="Stubbed Engineer",
    company="Stub Industries",
    sector="Testing",
    location="Nowhere",
    match_rating=3.5,
    match_summary="A fixed answer, so the end-to-end suite never calls OpenAI.",
)


Analyser = Callable[[str, str], JobAnalysis]


def get_analyser() -> Analyser:
    if settings.ai_stub:
        return lambda ad_text, profile: STUB
    return analyse


AnalyserDep = Annotated[Analyser, Depends(get_analyser)]
```

Note `SCORING.format(profile=profile)`: the profile is Markdown and may well contain a literal
brace, but it is the *argument*, never the template, so nothing in it is interpreted.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && uv run pytest tests/test_ai.py -v`
Expected: 7 passed.

- [ ] **Step 6: Lint**

Run: `cd backend && uv run ruff format . && uv run ruff check .`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add backend/app/ai.py backend/app/schemas.py backend/tests/test_ai.py
git commit -m "Add the OpenAI job advert analyser

One call returns the advert's fields and, when a profile exists, the match
score. The notebook prototype used three calls - reformat, extract, score - but
in production those are three round trips behind one spinner, and the model
handles a raw paste without the tidying pass.

The rating is snapped onto the half point scale in Python. OpenAI's strict
structured outputs do not reliably honour numeric bounds, and the column
promises a half point, so the promise is kept here rather than hoped for.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: The profile endpoints

**Files:**
- Modify: `backend/app/schemas.py`
- Create: `backend/app/routers/profile.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_profile.py`

**Interfaces:**
- Consumes: `Profile`, `PROFILE_ID` from Task 1.
- Produces: `GET /profile`, `PUT /profile`; `load_content(session: Session) -> str`, which Tasks 4
  and 6 both call.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_profile.py`:

```python
from sqlalchemy import func, select

from app.models import Profile


async def test_profile_starts_empty(client):
    response = await client.get("/profile")

    assert response.status_code == 200
    assert response.json()["content"] == ""
    assert response.json()["updated_at"] is None


async def test_profile_round_trips(client):
    written = await client.put("/profile", json={"content": "Nicolas, engineer."})

    assert written.status_code == 200
    assert written.json()["content"] == "Nicolas, engineer."
    assert written.json()["updated_at"] is not None

    read_back = await client.get("/profile")
    assert read_back.json()["content"] == "Nicolas, engineer."


async def test_writing_twice_replaces_the_one_row(client, session):
    await client.put("/profile", json={"content": "first"})
    await client.put("/profile", json={"content": "second"})

    assert (await client.get("/profile")).json()["content"] == "second"
    assert session.scalar(select(func.count()).select_from(Profile)) == 1


async def test_profile_can_be_emptied(client):
    await client.put("/profile", json={"content": "something"})

    await client.put("/profile", json={"content": ""})

    assert (await client.get("/profile")).json()["content"] == ""
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd backend && uv run pytest tests/test_profile.py -v`
Expected: 4 failures, all `404 Not Found` - the route does not exist.

- [ ] **Step 3: Add the schemas**

In `backend/app/schemas.py`:

```python
class ProfileWrite(BaseModel):
    content: str


class ProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    content: str
    updated_at: datetime.datetime | None
```

- [ ] **Step 4: Write the router**

Create `backend/app/routers/profile.py`:

```python
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import PROFILE_ID, Profile
from app.schemas import ProfileRead, ProfileWrite
from app.security import require_api_key

router = APIRouter(prefix="/profile", tags=["profile"], dependencies=[Depends(require_api_key)])

SessionDep = Annotated[Session, Depends(get_session)]


def load_content(session: Session) -> str:
    """The profile as plain text, empty until it has been written for the first time."""
    profile = session.get(Profile, PROFILE_ID)
    return profile.content if profile else ""


@router.get("", response_model=ProfileRead)
def read_profile(session: SessionDep):
    profile = session.get(Profile, PROFILE_ID)
    # A read never writes, so an unwritten profile answers rather than creating its own row.
    return profile or ProfileRead(content="", updated_at=None)


@router.put("", response_model=ProfileRead)
def replace_profile(payload: ProfileWrite, session: SessionDep):
    profile = session.get(Profile, PROFILE_ID)
    if profile is None:
        profile = Profile(id=PROFILE_ID, content=payload.content)
        session.add(profile)
    else:
        profile.content = payload.content
    session.flush()
    return profile
```

- [ ] **Step 5: Mount it**

In `backend/app/main.py`:

```python
from fastapi import FastAPI

from app.routers import applications, profile

app = FastAPI(title="Job Application Assistant")
app.include_router(applications.router)
app.include_router(profile.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_profile.py -v`
Expected: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/profile.py backend/app/schemas.py backend/app/main.py \
        backend/tests/test_profile.py
git commit -m "Add the candidate profile endpoints

GET and PUT on a single row. The read deliberately does not create the row it
misses: a GET that writes turns opening a screen into a mutation, and an empty
string is a perfectly good answer to 'what is the profile'.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: The analyse endpoint

**Files:**
- Create: `backend/app/routers/job_ads.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/test_analysis.py`

**Interfaces:**
- Consumes: `AnalyserDep`, `get_analyser`, `JobAnalysis` from Task 2; `load_content` from Task 3.
- Produces: `POST /job-ads/analyse`; the `stub_analyser` pytest fixture, reused by Task 6.

- [ ] **Step 1: Add the fixture**

In `backend/tests/conftest.py`, after the `seed` fixture:

```python
@pytest.fixture
def stub_analyser():
    """Swaps the OpenAI call for a recorder, so tests can assert what the model was handed."""

    calls: list[tuple[str, str]] = []

    def _install(**fields) -> list[tuple[str, str]]:
        answer = JobAnalysis(
            title=fields.get("title", "Full stack engineer"),
            company=fields.get("company", "BJAK"),
            sector=fields.get("sector", "Insurtech"),
            location=fields.get("location", "Sweden"),
            match_rating=fields.get("match_rating", 3.5),
            match_summary=fields.get("match_summary", "Three sentences would go here."),
        )

        def analyser(ad_text: str, profile: str) -> JobAnalysis:
            calls.append((ad_text, profile))
            return answer

        app.dependency_overrides[get_analyser] = lambda: analyser
        return calls

    yield _install
    app.dependency_overrides.pop(get_analyser, None)
```

and extend the imports at the top of the file:

```python
from app.ai import get_analyser
from app.schemas import JobAnalysis
```

- [ ] **Step 2: Write the failing tests**

Create `backend/tests/test_analysis.py`:

```python
ADVERT = "Full Stack Software Engineer - AI Finance Agent. Remote, Sweden."


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
        "match_summary": "Three sentences would go here.",
    }


async def test_analyse_hands_the_stored_profile_to_the_model(client, stub_analyser):
    calls = stub_analyser()
    await client.put("/profile", json={"content": "Nicolas, engineer."})

    await client.post("/job-ads/analyse", json={"text": ADVERT})

    assert calls == [(ADVERT, "Nicolas, engineer.")]


async def test_analyse_without_a_profile_passes_an_empty_string(client, stub_analyser):
    calls = stub_analyser(match_rating=None, match_summary=None)

    response = await client.post("/job-ads/analyse", json={"text": ADVERT})

    assert calls == [(ADVERT, "")]
    assert response.json()["match_rating"] is None
    assert response.json()["match_summary"] is None


async def test_analyse_rejects_an_empty_advert(client, stub_analyser):
    stub_analyser()

    response = await client.post("/job-ads/analyse", json={"text": ""})

    assert response.status_code == 422
```

- [ ] **Step 3: Run them to make sure they fail**

Run: `cd backend && uv run pytest tests/test_analysis.py -v`
Expected: 4 failures, `404 Not Found`.

- [ ] **Step 4: Write the router**

Create `backend/app/routers/job_ads.py`:

```python
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.ai import AnalyserDep
from app.db import get_session
from app.routers.profile import load_content
from app.schemas import JobAdText, JobAnalysis
from app.security import require_api_key

router = APIRouter(prefix="/job-ads", tags=["job-ads"], dependencies=[Depends(require_api_key)])

SessionDep = Annotated[Session, Depends(get_session)]


@router.post("/analyse", response_model=JobAnalysis)
def analyse_job_ad(payload: JobAdText, session: SessionDep, analyser: AnalyserDep):
    """Reads an advert. Stores nothing - the result is prefill, and the user has not agreed to it."""
    return analyser(payload.text, load_content(session))
```

- [ ] **Step 5: Mount it**

In `backend/app/main.py`, import `job_ads` and add `app.include_router(job_ads.router)` after the
applications router.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_analysis.py -v`
Expected: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/job_ads.py backend/app/main.py backend/tests/conftest.py \
        backend/tests/test_analysis.py
git commit -m "Add the job advert analyse endpoint

Stateless on purpose: the answer is a suggestion the user has not agreed to
yet, so nothing is written until they submit the form. An empty profile is not
an error - the fields still come back and only the score is withheld.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Applications carry the AI fields

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/applications.py:64-76`
- Modify: `backend/tests/test_applications.py`

**Interfaces:**
- Produces: `job_ad`, `match_rating`, `match_summary` accepted by `POST /applications` and returned
  by `GET /applications/{id}`; `match_rating` on every list row. `ApplicationPatch` is deliberately
  left alone.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_applications.py`:

```python
async def test_create_stores_the_ai_fields(client):
    application_id = await create(
        client,
        job_ad="Full Stack Software Engineer. Remote, Sweden.",
        match_rating=3.5,
        match_summary="Strong stack overlap, no fintech background.",
    )

    detail = (await client.get(f"/applications/{application_id}")).json()
    assert detail["job_ad"] == "Full Stack Software Engineer. Remote, Sweden."
    assert detail["match_rating"] == 3.5
    assert detail["match_summary"] == "Strong stack overlap, no fintech background."


async def test_an_application_created_by_hand_has_no_match(client):
    application_id = await create(client)

    detail = (await client.get(f"/applications/{application_id}")).json()
    assert detail["job_ad"] is None
    assert detail["match_rating"] is None
    assert detail["match_summary"] is None


async def test_patch_cannot_touch_the_ai_fields(client):
    application_id = await create(client, match_rating=3.5, match_summary="Original.")

    response = await client.patch(
        f"/applications/{application_id}",
        json={"title": "Renamed", "match_rating": 5, "match_summary": "Talked up."},
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Renamed"
    assert response.json()["match_rating"] == 3.5
    assert response.json()["match_summary"] == "Original."


async def test_the_list_carries_the_match_rating(client):
    await create(client, match_rating=4.0)

    row = (await client.get("/applications")).json()[0]

    assert row["match_rating"] == 4.0


async def test_create_rejects_a_match_rating_off_the_step(client):
    response = await client.post("/applications", json=payload(match_rating=3.7))

    assert response.status_code == 422
```

The third test is the whole point of the "AI-owned" decision: `ApplicationPatch` has no field for
these, so Pydantic drops them and the edit screen physically cannot rewrite a score.

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd backend && uv run pytest tests/test_applications.py -k "ai_fields or no_match or match_rating" -v`
Expected: failures - `KeyError: 'job_ad'` and `KeyError: 'match_rating'`.

- [ ] **Step 3: Extend the schemas**

In `backend/app/schemas.py`, add to `ApplicationCreate` - not to `ApplicationFields`, which
`ApplicationPatch` mirrors:

```python
class ApplicationCreate(ApplicationFields):
    first_update: StatusUpdateCreate
    # Written once, by AI mode. There is no matching field on ApplicationPatch, so a later hand
    # edit cannot rewrite a score the model gave.
    job_ad: str | None = None
    match_rating: Rating | None = None
    match_summary: str | None = None
```

Add `match_rating` to `ApplicationListItem` after `rating`:

```python
    rating: float | None
    match_rating: float | None
```

Add all three to `ApplicationDetail` after `link`:

```python
    link: str | None
    job_ad: str | None
    match_rating: float | None
    match_summary: str | None
```

- [ ] **Step 4: Carry it through the list query**

In `backend/app/routers/applications.py`, the list comprehension builds each row by hand. Add the
new field after `rating=application.rating`:

```python
            rating=application.rating,
            match_rating=application.match_rating,
```

`create_application` needs no change: it already does `payload.model_dump(exclude={"first_update"})`
and splats the result into `Application(...)`, so the three new columns come along.

- [ ] **Step 5: Run the whole backend suite**

Run: `cd backend && uv run pytest`
Expected: baseline + 20 passing (7 from Task 2, 4 from Task 3, 4 from Task 4, 5 here). All green.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas.py backend/app/routers/applications.py backend/tests/test_applications.py
git commit -m "Carry the AI fields through create, read and list

ApplicationCreate gains the three fields and ApplicationPatch deliberately does
not. That asymmetry is the whole of 'AI-owned': the edit form has no way to
send a score, so a hand-tuned number cannot quietly make one application look
better than another that was scored honestly.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Re-scoring an existing application

**Files:**
- Modify: `backend/app/routers/applications.py`
- Modify: `backend/tests/test_analysis.py`

**Interfaces:**
- Consumes: `AnalyserDep` from Task 2, `load_content` from Task 3, `stub_analyser` from Task 4.
- Produces: `POST /applications/{id}/match` returning `ApplicationDetail`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_analysis.py`:

```python
import uuid

from tests.test_applications import create


async def test_scoring_writes_the_match_onto_the_application(client, stub_analyser):
    calls = stub_analyser(match_rating=4.5, match_summary="Reassessed against a fuller profile.")
    await client.put("/profile", json={"content": "Nicolas, engineer."})
    application_id = await create(client, job_ad=ADVERT, match_rating=2.0, match_summary="Old.")

    response = await client.post(f"/applications/{application_id}/match")

    assert response.status_code == 200
    assert response.json()["match_rating"] == 4.5
    assert response.json()["match_summary"] == "Reassessed against a fuller profile."
    assert calls == [(ADVERT, "Nicolas, engineer.")]


async def test_scoring_without_a_stored_advert_is_409(client, stub_analyser):
    stub_analyser()
    await client.put("/profile", json={"content": "Nicolas, engineer."})
    application_id = await create(client)

    response = await client.post(f"/applications/{application_id}/match")

    assert response.status_code == 409


async def test_scoring_without_a_profile_is_409(client, stub_analyser):
    stub_analyser()
    application_id = await create(client, job_ad=ADVERT, match_rating=2.0)

    response = await client.post(f"/applications/{application_id}/match")

    assert response.status_code == 409
    # The refusal has to leave the old score alone, or an empty profile would erase history.
    detail = (await client.get(f"/applications/{application_id}")).json()
    assert detail["match_rating"] == 2.0


async def test_scoring_an_unknown_application_is_404(client, stub_analyser):
    stub_analyser()

    response = await client.post(f"/applications/{uuid.uuid4()}/match")

    assert response.status_code == 404
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd backend && uv run pytest tests/test_analysis.py -k scoring -v`
Expected: 4 failures, `405 Method Not Allowed` or `404`.

- [ ] **Step 3: Write the route**

In `backend/app/routers/applications.py`, extend the imports:

```python
from app.ai import AnalyserDep
from app.routers.profile import load_content
```

and add the route after `delete_application`:

```python
@router.post("/{application_id}/match", response_model=ApplicationDetail)
def score_match(application_id: uuid.UUID, session: SessionDep, analyser: AnalyserDep):
    """Re-scores a stored advert against the current profile, which is the point of storing it."""
    application = _load(session, application_id)
    if not application.job_ad:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This application has no stored job advert to score"
        )
    profile = load_content(session)
    # Scoring with no profile returns nulls, and writing those would erase a good score.
    if not profile.strip():
        raise HTTPException(status.HTTP_409_CONFLICT, "The candidate profile is empty")

    analysis = analyser(application.job_ad, profile)
    application.match_rating = analysis.match_rating
    application.match_summary = analysis.match_summary
    session.flush()
    return application
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_analysis.py -v`
Expected: 8 passed.

- [ ] **Step 5: Update the route inventory and the auth list**

`test_openapi_exposes_exactly_the_expected_routes` in `backend/tests/test_applications.py` asserts
the complete route set and will now be failing. Add the four new entries:

```python
        ("/applications/{application_id}/status-updates/{update_id}", "DELETE"),
        ("/applications/{application_id}/match", "POST"),
        ("/profile", "GET"),
        ("/profile", "PUT"),
        ("/job-ads/analyse", "POST"),
    }
```

Then add the same routes to the `parametrize` list feeding
`test_every_application_route_requires_the_api_key`, so the new endpoints are proved shut to an
unauthenticated caller:

```python
        ("POST", "/applications/00000000-0000-0000-0000-000000000000/match"),
        ("GET", "/profile"),
        ("PUT", "/profile"),
        ("POST", "/job-ads/analyse"),
```

- [ ] **Step 6: Run the whole backend suite**

Run: `cd backend && uv run pytest`
Expected: baseline + 28, all green. The jump from 20 to 28 is four new tests here plus four more
instances of the parametrized auth test, one per route added to its list. Then
`uv run ruff format . && uv run ruff check .`

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/applications.py backend/tests/test_analysis.py \
        backend/tests/test_applications.py
git commit -m "Score a stored advert against the current profile

Storing the advert is what makes this possible: the profile improves over time
and an application scored against last month's version can be reassessed
without pasting anything again.

Both refusals are 409 rather than a silent no-op. Scoring with an empty profile
returns nulls, and writing those would erase a score that was earned.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Generated types, the API client, and the date helper

The seam between the two services. Nothing renders yet.

**Files:**
- Modify: `backend/openapi.json` (regenerate)
- Modify: `frontend/src/lib/api-types.ts` (regenerate)
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/format.ts`
- Modify: `frontend/src/lib/format.test.ts`

**Interfaces:**
- Produces: `JobAnalysis` and `Profile` TypeScript types; `getProfile()`, `putProfile(content)`,
  `analyseJobAd(text)`, `scoreMatch(id)`; `todayIso(): string`.

- [ ] **Step 1: Regenerate both type artefacts**

```bash
cd backend && uv run python -m scripts.export_openapi
cd ../frontend && npm run gen:types
```

Confirm `frontend/src/lib/api-types.ts` now contains `JobAnalysis`, `ProfileRead` and `ProfileWrite`.
Neither file is ever hand-edited.

- [ ] **Step 2: Write the failing test**

In `frontend/src/lib/format.test.ts`, change the two existing import lines to add `afterEach`, `vi`
and `todayIso`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { formatDate, formatRating, todayIso } from "@/lib/format";
```

then append the new block:

```ts
describe("todayIso", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Both instants are built in local time, so the expected day holds in any timezone the suite
  // runs in - and both would come out a day wrong if todayIso reached for toISOString directly.
  it.each([
    [new Date(2026, 7, 17, 23, 30), "2026-08-17"],
    [new Date(2026, 7, 18, 0, 30), "2026-08-18"],
  ])("%s -> %s", (now, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(todayIso()).toBe(expected);
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `cd frontend && npm test`
Expected: FAIL, `todayIso is not exported`.

- [ ] **Step 4: Write the helper**

Append to `frontend/src/lib/format.ts`:

```ts
/**
 * A date input wants YYYY-MM-DD in the reader's own day. `toISOString` gives UTC's, which is the
 * previous day for anyone east of the line late in the evening.
 */
export function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npm test`
Expected: all passing.

- [ ] **Step 6: Extend the API client**

In `frontend/src/lib/api.ts`, add the types beside the existing ones:

```ts
export type JobAnalysis = components["schemas"]["JobAnalysis"];
export type Profile = components["schemas"]["ProfileRead"];
```

and the four calls at the bottom of the file:

```ts
export function getProfile() {
  return call<Profile>("/profile");
}

export function putProfile(content: string) {
  return call<Profile>("/profile", { method: "PUT", body: JSON.stringify({ content }) });
}

export function analyseJobAd(text: string) {
  return call<JobAnalysis>("/job-ads/analyse", { method: "POST", body: JSON.stringify({ text }) });
}

export function scoreMatch(id: string) {
  return call<ApplicationDetail>(`/applications/${id}/match`, { method: "POST" });
}
```

- [ ] **Step 7: Typecheck and commit**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: clean.

```bash
git add backend/openapi.json frontend/src/lib/api-types.ts frontend/src/lib/api.ts \
        frontend/src/lib/format.ts frontend/src/lib/format.test.ts
git commit -m "Generate the AI types and wire up the API client

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: The profile screen

**Files:**
- Create: `frontend/src/app/profile/actions.ts`
- Create: `frontend/src/app/profile/profile-form.tsx`
- Create: `frontend/src/app/profile/page.tsx`
- Modify: `frontend/src/components/app-header.tsx`

**Interfaces:**
- Consumes: `getProfile`, `putProfile` from Task 7.
- Produces: the `/profile` route. Task 9's empty-profile message links to it.

- [ ] **Step 1: Write the action**

Create `frontend/src/app/profile/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { putProfile } from "@/lib/api";

export type ProfileState = { saved?: boolean };

export async function saveProfileAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  await putProfile(String(formData.get("content") ?? ""));
  revalidatePath("/", "layout");
  return { saved: true };
}
```

- [ ] **Step 2: Write the form**

Create `frontend/src/app/profile/profile-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";

import { saveProfileAction, type ProfileState } from "@/app/profile/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ProfileForm({ content }: { content: string }) {
  const [state, submit, pending] = useActionState<ProfileState, FormData>(saveProfileAction, {});

  return (
    <form action={submit} className="space-y-4">
      <Textarea
        id="content"
        name="content"
        aria-label="Candidate profile"
        rows={24}
        defaultValue={content}
        placeholder="Your background, skills, what you have shipped, what you are looking for."
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save profile"}
        </Button>
        {state.saved && !pending && <p className="text-sm text-muted-foreground">Saved.</p>}
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Write the page**

Create `frontend/src/app/profile/page.tsx`:

```tsx
import { AppHeader } from "@/components/app-header";
import { ProfileForm } from "@/app/profile/profile-form";
import { getProfile } from "@/lib/api";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const profile = await getProfile();

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Your background, in your own words. AI mode scores a job advert against this, so the more
          it says about what you have actually built, the more the score is worth.
        </p>
        <ProfileForm content={profile.content} />
      </main>
    </>
  );
}
```

- [ ] **Step 4: Link it from the header**

In `frontend/src/components/app-header.tsx`, add a link before the theme toggle:

```tsx
        <Button asChild variant="ghost" size="sm">
          <Link href="/profile">Profile</Link>
        </Button>
        <ThemeToggle />
```

- [ ] **Step 5: Check it by hand**

Start both services (`cd backend && uv run fastapi dev app/main.py`, then `cd frontend && npm run
dev`). Sign in, click `Profile`, paste the contents of `local-testing/CONTEXT.md`, save, reload.
Expected: the text is still there and `Saved.` appeared.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/profile frontend/src/components/app-header.tsx
git commit -m "Add the profile screen

The candidate profile is the input the match score is only as good as, so it
belongs somewhere editable in the app rather than in a file that needs a
redeploy to change.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: AI mode on the new-application form

The feature the whole plan is for.

**Files:**
- Modify: `frontend/src/app/applications/actions.ts`
- Create: `frontend/src/components/job-ad-analyser.tsx`
- Modify: `frontend/src/components/application-form.tsx`

**Interfaces:**
- Consumes: `analyseJobAd` from Task 7, `todayIso` from Task 7, `JobAnalysis` type from Task 7.
- Produces: `analyseJobAdAction(text) -> AnalysisState`; `JobAdAnalyser` component with an
  `onAnalysed(analysis, adText)` callback.

- [ ] **Step 1: Write the action**

In `frontend/src/app/applications/actions.ts`, extend the import from `@/lib/api` with
`analyseJobAd` and `scoreMatch`, then add:

```ts
export type AnalysisState = { analysis?: JobAnalysis; error?: string };

export async function analyseJobAdAction(text: string): Promise<AnalysisState> {
  if (!text.trim()) return { error: "Paste the job advert first" };
  try {
    return { analysis: await analyseJobAd(text) };
  } catch (error) {
    // The browser gets a sentence, not a stack trace; the server log keeps the detail.
    console.error(error);
    return { error: "The advert could not be read. Try again." };
  }
}

export async function scoreMatchAction(id: string): Promise<{ error?: string }> {
  try {
    await scoreMatch(id);
  } catch (error) {
    console.error(error);
    if (error instanceof ApiError && error.status === 409) {
      return { error: "Fill in your profile first, on the Profile screen." };
    }
    return { error: "Scoring failed. Try again." };
  }
  revalidatePath("/", "layout");
  return {};
}
```

Add `ApiError` and `type JobAnalysis` to the existing `@/lib/api` import.

- [ ] **Step 2: Carry the AI fields into the create call**

In the same file, add a reader beside `readApplication`:

```ts
/** Hidden fields, written by AI mode only. Absent on a hand-filled form. */
function readAiFields(formData: FormData) {
  const matchRating = optional(formData, "match_rating");
  return {
    job_ad: optional(formData, "job_ad"),
    match_rating: matchRating === null ? null : Number(matchRating),
    match_summary: optional(formData, "match_summary"),
  };
}
```

and use it in `createApplicationAction`, replacing the existing `createApplication` call:

```ts
  const created = await createApplication({
    ...application.data,
    ...readAiFields(formData),
    first_update: firstUpdate.data,
  });
```

These fields are not in `applicationSchema` because they are not user input - the backend validates
the rating against the same half-point rule, and it is the authority.

- [ ] **Step 3: Write the analyser component**

Create `frontend/src/components/job-ad-analyser.tsx`:

```tsx
"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { analyseJobAdAction } from "@/app/applications/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { JobAnalysis } from "@/lib/api";

export function JobAdAnalyser({
  onAnalysed,
}: {
  onAnalysed: (analysis: JobAnalysis, adText: string) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unscored, setUnscored] = useState(false);
  const [pending, startTransition] = useTransition();

  function analyse() {
    setError(null);
    startTransition(async () => {
      const result = await analyseJobAdAction(text);
      if (result.error || !result.analysis) {
        setError(result.error ?? "The advert could not be read. Try again.");
        return;
      }
      setUnscored(result.analysis.match_rating === null);
      onAnalysed(result.analysis, text);
    });
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <Switch id="ai-mode" checked={enabled} onCheckedChange={setEnabled} disabled={pending} />
        <Label htmlFor="ai-mode" className="text-sm font-normal">
          AI mode
        </Label>
        <span className="text-sm text-muted-foreground">Paste the advert and let it fill this in</span>
      </div>

      {enabled && (
        <div className="space-y-3">
          <Textarea
            id="job-ad"
            aria-label="Job advert"
            rows={8}
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={pending}
            placeholder="Paste the whole job advert here"
          />
          <div className="flex items-center gap-3">
            <Button type="button" onClick={analyse} disabled={pending || text.trim() === ""}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {pending ? "Reading the advert..." : "Fill the form"}
            </Button>
            {pending && (
              <p role="status" className="text-sm text-muted-foreground">
                This takes a few seconds.
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {unscored && !pending && (
            <p className="text-sm text-muted-foreground">
              Fields filled in, but there is no match score:{" "}
              <Link href="/profile" className="text-primary underline underline-offset-4">
                your profile is empty
              </Link>
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

`import type` from `@/lib/api` is erased at compile time, so the `server-only` module is never
pulled into the client bundle. `application-form.tsx` already relies on this.

- [ ] **Step 4: Hold the analysis in the form**

Rewrite `frontend/src/components/application-form.tsx`. The changes are: the `useState` pair, the
`key` on the `<form>`, `analysis?.` in front of four `defaultValue`s, the prefilled date, the three
hidden inputs, and the analyser rendered above the form when creating.

```tsx
"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import type { FormState } from "@/app/applications/actions";
import { Field, selectClasses } from "@/components/field";
import { JobAdAnalyser } from "@/components/job-ad-analyser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ApplicationDetail, JobAnalysis } from "@/lib/api";
import { todayIso } from "@/lib/format";
import { STATUSES } from "@/lib/status";

const RATINGS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

export function ApplicationForm({
  action,
  application,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  application?: ApplicationDetail;
  cancelHref: string;
}) {
  const [state, submit, pending] = useActionState<FormState, FormData>(action, {});
  const [prefill, setPrefill] = useState<{ analysis: JobAnalysis; adText: string } | null>(null);
  // The form is uncontrolled, so a new analysis only reaches the inputs by remounting them.
  const [prefillKey, setPrefillKey] = useState(0);
  const errors = state.errors ?? {};
  const creating = application === undefined;
  const analysis = prefill?.analysis;

  function applyAnalysis(next: JobAnalysis, adText: string) {
    setPrefill({ analysis: next, adText });
    setPrefillKey((count) => count + 1);
  }

  return (
    <div className="space-y-6">
      {creating && <JobAdAnalyser onAnalysed={applyAnalysis} />}

      <form key={prefillKey} action={submit} className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <Field name="title" label="Job title" errors={errors.title}>
            <Input
              id="title"
              name="title"
              defaultValue={analysis?.title ?? application?.title}
              required
            />
          </Field>
          <Field name="company" label="Company" errors={errors.company}>
            <Input
              id="company"
              name="company"
              defaultValue={analysis?.company ?? application?.company}
              required
            />
          </Field>
          <Field name="sector" label="Sector" errors={errors.sector}>
            <Input
              id="sector"
              name="sector"
              defaultValue={analysis?.sector ?? application?.sector}
              required
            />
          </Field>
          <Field name="location" label="Location" errors={errors.location}>
            <Input
              id="location"
              name="location"
              defaultValue={analysis?.location ?? application?.location}
              required
            />
          </Field>
          <Field name="rating" label="Rating" errors={errors.rating}>
            <select
              id="rating"
              name="rating"
              defaultValue={application?.rating ?? ""}
              className={selectClasses}
            >
              <option value="">Not rated</option>
              {RATINGS.map((rating) => (
                <option key={rating} value={rating}>
                  {rating}
                </option>
              ))}
            </select>
          </Field>
          <Field name="link" label="Job posting link" errors={errors.link}>
            <Input id="link" name="link" defaultValue={application?.link ?? ""} />
          </Field>
        </div>

        <Field name="comment" label="Comment" errors={errors.comment}>
          <Textarea id="comment" name="comment" rows={4} defaultValue={application?.comment ?? ""} />
        </Field>

        {creating && (
          <fieldset className="space-y-6 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">First status update</legend>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field name="status" label="Status" errors={errors.status}>
                <select id="status" name="status" defaultValue="Applied" className={selectClasses}>
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </Field>
              <Field name="date" label="Date" errors={errors.date}>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  defaultValue={analysis ? todayIso() : undefined}
                  required
                />
              </Field>
            </div>
            <Field name="note" label="Note" errors={errors.note}>
              <Textarea id="note" name="note" rows={2} />
            </Field>
          </fieldset>
        )}

        {prefill && (
          <>
            <input type="hidden" name="job_ad" value={prefill.adText} />
            <input type="hidden" name="match_rating" value={analysis?.match_rating ?? ""} />
            <input type="hidden" name="match_summary" value={analysis?.match_summary ?? ""} />
          </>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : creating ? "Create application" : "Save changes"}
          </Button>
          <Button type="button" variant="ghost" asChild>
            <Link href={cancelHref}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
```

The edit screen never renders `JobAdAnalyser` and never sets `prefill`, so `prefillKey` stays `0`
and the form behaves exactly as it does today.

- [ ] **Step 5: Check it by hand**

With both services running and a profile saved, open `/applications/new`, turn on `AI mode`, paste
`local-testing/JOB.md`, click `Fill the form`. Expected: the button shows a spinner and reads
`Reading the advert...`, then the four fields fill in, the date is today, and the button is usable
again. Save. Expected: the detail screen opens on the new application.

Then repeat with the profile emptied on `/profile`. Expected: the fields still fill in and the
message about the empty profile appears under the button.

- [ ] **Step 6: Typecheck, lint, commit**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm test`

```bash
git add frontend/src/components/job-ad-analyser.tsx frontend/src/components/application-form.tsx \
        frontend/src/app/applications/actions.ts
git commit -m "Add AI mode to the new application form

Paste an advert, get the form filled in and a match score, then check it before
saving. The extraction is a suggestion: nothing is written until the form is
submitted, and every field stays editable.

The form is uncontrolled, so an analysis reaches the inputs by remounting them
on a key rather than by converting six fields to controlled state.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: The detail screen

**Files:**
- Create: `frontend/src/components/score-match-button.tsx`
- Modify: `frontend/src/app/applications/[id]/page.tsx`

**Interfaces:**
- Consumes: `scoreMatchAction` from Task 9; `job_ad`, `match_rating`, `match_summary` on
  `ApplicationDetail` from Task 7.

- [ ] **Step 1: Write the button**

Create `frontend/src/components/score-match-button.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";

import { scoreMatchAction } from "@/app/applications/actions";
import { Button } from "@/components/ui/button";

export function ScoreMatchButton({ id, scored }: { id: string; scored: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function score() {
    setError(null);
    startTransition(async () => {
      const result = await scoreMatchAction(id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={score} disabled={pending}>
        {pending ? "Scoring..." : scored ? "Score again" : "Score this match"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  );
}
```

- [ ] **Step 2: Show the match**

In `frontend/src/app/applications/[id]/page.tsx`, add the import beside the existing component
imports:

```tsx
import { ScoreMatchButton } from "@/components/score-match-button";
```

and add the block immediately after the closing `</dl>`:

```tsx
        {application.match_rating != null && (
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">AI match</p>
            <p className="text-lg font-medium">{application.match_rating} / 5</p>
            {application.match_summary && (
              <p className="mt-2 text-sm break-words whitespace-pre-line">
                {application.match_summary}
              </p>
            )}
          </div>
        )}
```

- [ ] **Step 3: Show the stored advert**

After the existing `comment` block, collapsed by default so a full advert never buries the timeline:

```tsx
        {application.job_ad && (
          <details className="rounded-lg border p-4 text-sm">
            <summary className="cursor-pointer text-muted-foreground">Job advert</summary>
            <p className="mt-3 break-words whitespace-pre-line">{application.job_ad}</p>
          </details>
        )}
```

- [ ] **Step 4: Offer the re-score**

In the existing button row, after `<DeleteApplication ... />`:

```tsx
          {application.job_ad && (
            <ScoreMatchButton
              id={application.id}
              scored={application.match_rating != null}
            />
          )}
```

- [ ] **Step 5: Check it by hand**

Open the application created in Task 9. Expected: an `AI match` block with the score and its three
sentences, a collapsed `Job advert` block holding the pasted text, and a `Score again` button that
re-runs and leaves the page showing a fresh score. On an application with no stored advert, none of
the three appear. With the profile emptied, `Score again` shows the message pointing at `/profile`
and leaves the old score untouched.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
git add frontend/src/components/score-match-button.tsx "frontend/src/app/applications/[id]/page.tsx"
git commit -m "Show the AI match and the stored advert on the detail screen

The advert is collapsed by default. It is the longest thing on the record and
the timeline is what the screen is for.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: The list screen

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Add the badge**

In `frontend/src/app/page.tsx`, in the right-hand cluster of each row, immediately after the
personal rating span:

```tsx
                    <span title="Your rating">{formatRating(application.rating)}</span>
                    {application.match_rating != null && (
                      <span
                        title="AI match"
                        className="rounded border px-1.5 py-0.5 text-xs tabular-nums"
                      >
                        AI {application.match_rating}
                      </span>
                    )}
```

Two numbers on one row are easy to confuse, so the AI one carries a visible `AI` prefix rather than
relying on the tooltip. Rows with no match show one number, exactly as today.

- [ ] **Step 2: Check it by hand**

Reload `/`. Expected: the application from Task 9 shows both numbers; every imported application
shows only its personal rating.

- [ ] **Step 3: Typecheck, lint, commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "Show the AI match on the list

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: End-to-end coverage

**Files:**
- Modify: `frontend/playwright.config.ts:56-59`
- Create: `frontend/e2e/ai-mode.spec.ts`

**Interfaces:**
- Consumes: `settings.ai_stub` and `STUB` from Task 2, and every screen from Tasks 8 to 11.

- [ ] **Step 1: Turn on the stub for the test backend**

In `frontend/playwright.config.ts`, add one line to the backend `webServer` env block:

```ts
      env: {
        DATABASE_URL: backend.TEST_DATABASE_URL,
        BACKEND_API_KEY: frontend.BACKEND_API_KEY,
        // The analyse call is made server-side, so page.route() cannot reach it. The seam is here.
        AI_STUB: "true",
      },
```

`OPENAI_API_KEY` is not listed: pydantic-settings falls back to `backend/.env`, the same way
`TEST_DATABASE_URL` already resolves.

- [ ] **Step 2: Write the specs**

Create `frontend/e2e/ai-mode.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

import { STORAGE_STATE } from "./helpers";

test.use({ storageState: STORAGE_STATE });

const ADVERT = "Full Stack Software Engineer - AI Finance Agent. Remote, Sweden. 3+ years.";

async function saveProfile(page: Page, content: string) {
  await page.goto("/profile");
  await page.getByLabel("Candidate profile").fill(content);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
}

/** Returns the detail URL. Waiting for the heading first: the click redirects, and reading
 *  page.url() before that lands gives the form's URL, not the new application's. */
async function createThroughAiMode(page: Page): Promise<string> {
  await page.goto("/applications/new");
  await page.getByLabel("AI mode").click();
  await page.getByLabel("Job advert").fill(ADVERT);
  await page.getByRole("button", { name: "Fill the form" }).click();
  await expect(page.getByLabel("Job title")).toHaveValue("Stubbed Engineer");
  await page.getByRole("button", { name: "Create application" }).click();
  await expect(page.getByRole("heading", { name: "Stubbed Engineer" })).toBeVisible();
  return page.url();
}

test("the profile survives a reload", async ({ page }) => {
  await saveProfile(page, "Nicolas, full stack engineer.");

  await page.reload();

  await expect(page.getByLabel("Candidate profile")).toHaveValue("Nicolas, full stack engineer.");
});

test("AI mode fills the form from a pasted advert", async ({ page }) => {
  await saveProfile(page, "Nicolas, full stack engineer.");
  await page.goto("/applications/new");

  // The form is empty and the paste box is not offered until AI mode is on.
  await expect(page.getByLabel("Job advert")).toBeHidden();
  await page.getByLabel("AI mode").click();
  await page.getByLabel("Job advert").fill(ADVERT);
  await page.getByRole("button", { name: "Fill the form" }).click();

  await expect(page.getByLabel("Job title")).toHaveValue("Stubbed Engineer");
  await expect(page.getByLabel("Company")).toHaveValue("Stub Industries");
  await expect(page.getByLabel("Sector")).toHaveValue("Testing");
  await expect(page.getByLabel("Location")).toHaveValue("Nowhere");
  await expect(page.getByLabel("Date")).not.toHaveValue("");

  await page.getByRole("button", { name: "Create application" }).click();

  await expect(page.getByRole("heading", { name: "Stubbed Engineer" })).toBeVisible();
  await expect(page.getByText("3.5 / 5")).toBeVisible();
  await expect(page.getByText("A fixed answer")).toBeVisible();
  await expect(page.getByText("Job advert")).toBeVisible();
});

test("an AI scored application shows its match on the list", async ({ page }) => {
  await saveProfile(page, "Nicolas, full stack engineer.");
  await createThroughAiMode(page);

  await page.goto("/");

  await expect(page.getByText("AI 3.5")).toBeVisible();
});

test("scoring is refused while the profile is empty", async ({ page }) => {
  await saveProfile(page, "Nicolas, full stack engineer.");
  const detail = await createThroughAiMode(page);

  await saveProfile(page, "");
  await page.goto(detail);
  await page.getByRole("button", { name: "Score again" }).click();

  await expect(page.getByRole("alert")).toContainText("profile");
  // The refusal must not have wiped the score that was already earned.
  await expect(page.getByText("3.5 / 5")).toBeVisible();
});
```

- [ ] **Step 3: Run the suite**

Run: `cd frontend && npm run test:e2e`
Expected: every spec passes, including the pre-existing `applications`, `login` and `timeline`
files. The run starts both services itself; stop any dev servers first so ports 3100 and 8100 are
free.

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/ai-mode.spec.ts frontend/playwright.config.ts
git commit -m "Cover AI mode end to end against a stubbed analyser

The analyse request is made by the Next server, so page.route() has nothing to
intercept and the stub has to live in the backend behind AI_STUB. That buys a
suite that exercises the toggle, the prefill, the save and the refusal path
without spending a token or depending on a model's mood.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Spec, docs, deployment

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `backend/vercel.json`

- [ ] **Step 1: Raise the function timeout**

Two model calls' worth of latency does not fit in a default serverless window. In
`backend/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "fastapi",
  "functions": {
    "app/main.py": {
      "maxDuration": 60
    }
  }
}
```

- [ ] **Step 2: Update the spec**

Six passages in `AGENTS.md` go stale. Edit each:

1. **MVP scope** - the record's field list gains three entries after `Job posting link (optional)`:

```
- The pasted job advert, when the record was created from one (optional)
- An AI match rating (1-5, half points) and its three-sentence justification (optional)
```

2. **Screens** - a fifth screen after `Create / edit application`:

```
5. **Profile** - one textarea holding the candidate's background, reached from the header. AI mode
   scores adverts against it. Empty until written, which is a supported state, not an error.
```

and, in screen 4, note the toggle:

```
4. **Create / edit application** - one form. Creating requires an initial status and its date. An
   `AI mode` toggle on the create form takes a pasted job advert, fills the fields in from it, and
   scores the match. Every field stays editable and nothing is written until the form is submitted.
```

3. **Explicitly out of scope** - remove nothing, but add a sentence under the list:

```
AI mode extracts fields from a pasted advert and scores the match. It does not fetch a URL, write
cover letters, or suggest what to apply to next.
```

4. **API** - three rows in the table:

```
| `POST`   | `/job-ads/analyse`                             | Extract fields and score one pasted advert       |
| `POST`   | `/applications/{id}/match`                     | Re-score a stored advert against the profile     |
| `GET`    | `/profile`                                     | Read the candidate profile                       |
| `PUT`    | `/profile`                                     | Replace the candidate profile                    |
```

5. **Schema** - the two blocks:

```
applications
  ...
  link           text        null
  job_ad         text        null        -- the advert as pasted, when AI mode created the record
  match_rating   real        null        -- 1.0-5.0, 0.5 steps, written by AI only
  match_summary  text        null        -- three sentences justifying match_rating
  ...

profile
  id             integer primary key check (id = 1)   -- one candidate, one row
  content        text        not null
  updated_at     timestamptz not null
```

6. **Environment variables** - three rows in the backend table:

```
| `OPENAI_API_KEY`   | Key for the extraction and scoring call     |
| `OPENAI_MODEL`     | Optional. Defaults to `gpt-5.5`             |
| `AI_STUB`          | Test only. Playwright sets it to skip OpenAI |
```

7. **Testing focus** - add to the pytest list:

```
- The half-point snap on whatever the model returns, including out-of-range values
- That `ApplicationPatch` cannot write `match_rating`, `match_summary` or `job_ad`
- That re-scoring with an empty profile is refused rather than erasing the existing score
```

8. **Deferred decisions** - three new entries:

```
- **The match is AI-owned and read-only.** `ApplicationCreate` accepts the three AI fields and
  `ApplicationPatch` has no field for any of them, so a score cannot be hand-tuned. The cost is that
  a wrong score can only be replaced by re-scoring, never corrected or cleared.
- **The advert is stored as pasted.** No tidying pass, so the detail screen shows a raw copy-paste,
  including whatever navigation text came with it. It is collapsed by default for that reason.
- **`AI_STUB` is test-only configuration in production code.** The analyse call is made server-side,
  so Playwright cannot intercept it from the browser and the seam has to exist in the backend.
```

- [ ] **Step 3: Update the README**

Two edits, both minimal - that is the standing instruction for this file.

In the `Setup` section, after the paragraph about `TEST_DATABASE_URL`, add:

```
`OPENAI_API_KEY` is needed for AI mode. The suite never calls OpenAI, but the backend constructs
its client at import, so the variable has to be set for anything to start.
```

In the `Deploy` section, extend the closing line about which project holds what:

```
`DATABASE_URL` and `OPENAI_API_KEY` belong to the backend project only. The frontend holds
`APP_PASSWORD`, `AUTH_SECRET`, `BACKEND_URL` and `BACKEND_API_KEY`.
```

- [ ] **Step 4: Full verification**

```bash
cd backend && uv run ruff format . && uv run ruff check . && uv run pytest
cd ../frontend && npx tsc --noEmit && npm run lint && npm test && npm run test:e2e
```

Expected: backend at baseline + 28, frontend unit tests green, Playwright green.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md README.md backend/vercel.json
git commit -m "Document AI mode and raise the backend function timeout

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Deploy and smoke-test**

1. Merge to `main`.
2. Add `OPENAI_API_KEY` to the **backend** Vercel project's environment variables. Do not add it to
   the frontend project - the browser must never be able to reach it.
3. Run `alembic upgrade head` against the production database.
4. Confirm the backend deploy log shows no warning that the `app/main.py` function pattern matched
   nothing. If it does, set the maximum duration to 60 seconds in the project's
   Settings > Functions instead, and revert the `functions` block.
5. In the deployed app: save the profile, create an application through AI mode with a real advert,
   and confirm the score and the three sentences appear on the detail screen.
6. Confirm the request completed well inside the timeout. If it did not, the fix is to split the one
   call back into extract-then-score and run them concurrently, not to raise the timeout further.

---

## Success criteria

The increment is done when all of these hold:

- [ ] `cd backend && uv run pytest` is green at baseline + 28 tests
- [ ] `cd frontend && npm test` is green, `npx tsc --noEmit` and `npm run lint` are clean
- [ ] `cd frontend && npm run test:e2e` is green, including the four new AI mode cases
- [ ] Pasting an advert with a profile saved fills six inputs and shows a score
- [ ] Pasting an advert with no profile fills the inputs, shows no score, and says why
- [ ] The edit form has no AI mode toggle and no way to change a score
- [ ] `PATCH /applications/{id}` with `match_rating` in the body leaves the stored score unchanged
- [ ] The list shows two labelled numbers on AI-scored rows and one on every imported row
- [ ] `Score again` re-runs against the current profile; with an empty profile it refuses and the
      old score survives
- [ ] Every application that existed before this work still has `NULL` in all three new columns
- [ ] Both Vercel projects redeployed, and a real advert scored end to end in production
