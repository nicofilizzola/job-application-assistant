# Profile AI Mode: Natural-Language Enrichment - Implementation Plan

> **For agentic workers:** use the `executing-plans` skill to work through this plan task by task.
> Steps use checkbox (`- [ ]`) syntax for tracking. Tick them as you go.
>
> **Task 1 is a blocking human sign-off.** Nothing in Tasks 2-6 may be started until a human has
> approved the prompt text. If you find yourself writing `app/ai.py` before that approval, stop.

**Goal:** On the profile screen, an `AI mode` toggle takes a plain-English update ("I finished the
AWS Solutions Architect course") and returns the whole profile with that update folded in, additively
and without touching the existing structure, shown as a live diff the user can hand-edit before
saving.

**Architecture:** One new stateless endpoint, `POST /profile/enrich`, takes the profile text the
editor currently holds plus the instruction and returns a proposed replacement. It reads and writes
no database row: the draft belongs to the browser until the user presses `Save profile`, which is
still the existing `PUT /profile`. The model call sits behind the same dependency seam the advert
analyser uses, so `AI_STUB` swaps it out for Playwright. On the frontend the profile form becomes
controlled and grows three states - mode, instruction, draft - and one new pure helper,
`diffProfile`, compares the saved profile with the draft on every keystroke. The diff is rendered
with `<ins>` and `<del>`, so the meaning survives without colour.

**Tech Stack:** FastAPI, Pydantic v2, `openai` Python SDK (Responses API, plain text output), pytest
(backend); Next.js 16 App Router, Server Actions, Tailwind, shadcn/ui, `diff` v9 (jsdiff), Vitest,
Playwright (frontend). No database migration: nothing new is stored.

**Spec:** `AGENTS.md`. Read it before starting. It describes a profile screen with exactly one
textarea and one save button, and its API table has no enrich route. Task 6 rewrites the passages
that go stale. Until then the spec and this plan disagree on purpose, and the plan wins.

## Decisions closed before planning

| Question                                          | Answer                                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| How the result is reviewed                        | A live diff panel above an editable textarea. Typing in the textarea recomputes the diff against the saved profile, so edits are always shown in context |
| Diff granularity and where it runs                | Word level, in the browser, with the `diff` package: lines first, then words inside a line the rewrite replaced |
| How hard "additive only" is enforced              | A prompt rule plus a visible count. Removed text is struck through and counted, with a warning above the save button. Saving is still allowed - the user can see exactly what would be lost |
| AI mode with an empty profile                     | Allowed. The instruction alone produces a first version, shown as an all-added diff. Nothing can be damaged, and nothing is written until Save |

## Decisions taken while planning

Technical, reversible, and flagged so they can be revisited rather than rediscovered.

| Decision                                                     | Reason                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| The request carries the editor's text, not just the instruction | `POST /profile/enrich` takes `{content, instruction}` and touches no row. A second instruction therefore builds on an unsaved draft, which is how anyone actually uses this: add the course, then add the client project. It also makes the endpoint pure, so its test needs no database state |
| The diff's left side is always the **saved** profile           | Chaining two instructions shows the cumulative change, which is what the Save button is about to write. A diff against the previous draft would hide the first instruction's work |
| `<ins>` and `<del>`, not two coloured `<span>`s                | The elements carry insertion and deletion semantically, so a screen reader and a colourblind reader both get the signal. `AGENTS.md` requires colour never to be the only one |
| Counted in words, with a word defined as a letter-or-digit run  | `## Certifications` adds one word, not two. Counting lines misfires: appending `, AWS` to an existing line is one line out and one line in at line granularity, which would report a removal where nothing was lost |
| The profile textarea is `readOnly`, never `disabled`, in AI mode | A disabled field submits nothing. This one carries the entire profile, so `formData.get("content")` would be null and a save from AI mode would blank the profile |
| The form resets when the `content` prop changes                | After a save the server sends the new profile back; the render-time comparison closes the AI panel and rebases the draft. Remounting on a `key` would do the same but would also wipe `useActionState`, and with it the `Saved.` confirmation the end-to-end suite asserts on |
| No history of instructions, no profile versions               | Nothing is stored but the profile itself. One user correcting their own document does not need an audit trail, and the diff already shows what a save is about to do |
| The toggle is labelled `AI mode`, same as the create form      | Two screens, one name for "let the model do it". The Playwright selectors do not collide - they are on different pages |
| The stub appends one line derived from the instruction         | `stub_enrich` returns the profile plus `Added by the stub: <instruction>`, so the end-to-end diff has both untouched and added text, and the assertion proves the instruction reached the backend. A fixed constant would prove neither |
| Removals are exercised by hand-editing, not by the stub        | A stub that drops a line would need a magic keyword in production code. Deleting a line in the textarea produces a removal through the live diff, which tests the warning and the live recompute in one go |
| No `vercel.json` change                                       | `backend/vercel.json` sets no `maxDuration` today and the analyse call already returns inside the default. A rewrite is one call of comparable size |

## Global Constraints

Copied from `AGENTS.md`. Every task's requirements implicitly include these.

- **No emojis anywhere in the repo.** Not in code, comments, commits, or docs.
- UI, labels, statuses and code are in **English**. Existing free-text data is never translated.
- Keep it simple. No over-engineering, no unnecessary defensive programming, no extra features.
- The browser never calls FastAPI. Every read and write goes browser -> Next -> FastAPI.
- Every FastAPI route except `/health` requires a matching `X-API-Key`.
- `revalidatePath` after every mutation, because Server Components hold the cached read. An enrich
  is **not** a mutation: it writes nothing, so it must not revalidate.
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

- [ ] Branch off `main`: `git switch -c profile-ai-enrichment`
- [ ] `git status` already shows `M .gitignore`, `M skills-lock.json` and untracked
      `.agents/skills/caveman/`, `.agents/skills/writing-plans/`, `.claude/skills/caveman/`,
      `.claude/skills/writing-plans/`. None of them belong to this work. Every commit step below
      uses an explicit `git add <paths>`; never `git add -A`, or those get swept in.
- [ ] Confirm the baseline is green before changing anything and **write the three counts down**:

      ```bash
      cd backend && uv run pytest            # expect 92 passed
      cd frontend && npm test                # expect 21 passed
      cd frontend && npx playwright test     # expect 19 passed
      ```

      Every task below states how many tests it adds, and those numbers are only checkable against
      this baseline. If the baseline differs, use your own numbers, not the ones written here.
- [ ] If anything talking to Postgres hangs for a minute and then reports `server closed the
      connection unexpectedly`, disconnect Proton VPN before debugging anything else.
      `.agents/notes/local-database-access.md` has the confirming test.

## File Structure

| File                                              | Responsibility                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| `backend/app/schemas.py`                          | Modify: `ProfileEnrich` request, `ProfileDraft` response              |
| `backend/app/ai.py`                               | Modify: the rewrite prompt, `enrich`, `stub_enrich`, the enricher dependency |
| `backend/app/routers/profile.py`                  | Modify: `POST /profile/enrich`                                        |
| `backend/tests/conftest.py`                       | Modify: a `stub_enricher` fixture                                     |
| `backend/tests/test_profile.py`                   | Modify: five enrich contract tests                                    |
| `backend/tests/test_ai.py`                        | Modify: two tests for the stub enricher                               |
| `backend/tests/test_applications.py`              | Modify: the route inventory and the auth parametrize list             |
| `backend/openapi.json`                            | Regenerate                                                            |
| `frontend/package.json`                           | Modify: add `diff`                                                    |
| `frontend/src/lib/profile-diff.ts`                | Create: `diffProfile`, the only real logic on the frontend             |
| `frontend/src/lib/profile-diff.test.ts`           | Create: its Vitest cases                                              |
| `frontend/src/lib/api-types.ts`                   | Regenerate                                                            |
| `frontend/src/lib/api.ts`                         | Modify: `enrichProfile`, the `ProfileDraft` type                       |
| `frontend/src/app/profile/actions.ts`             | Modify: `enrichProfileAction`                                         |
| `frontend/src/components/profile-diff-view.tsx`   | Create: the diff panel, presentational only                           |
| `frontend/src/app/profile/profile-form.tsx`       | Modify: the mode toggle, the instruction box, the live diff, discard   |
| `frontend/src/app/profile/page.tsx`               | Modify: the screen's description line                                 |
| `frontend/e2e/helpers.ts`                         | Modify: move `saveProfile` here so both specs share it                |
| `frontend/e2e/ai-mode.spec.ts`                    | Modify: import `saveProfile` instead of declaring it                  |
| `frontend/e2e/profile-ai.spec.ts`                 | Create: the four end-to-end cases                                     |
| `AGENTS.md`                                       | Modify: screen 5, the API table, the testing focus, deferred decisions |
| `README.md`                                       | Modify: one sentence on what `OPENAI_API_KEY` now buys                |

---

## Task 1: Approve the rewrite prompt (BLOCKING - a human signs this off) - APPROVED 19 Aug 2026

**Files:** none. This task writes no code.

> **Approved.** The block in Step 1 is the signed-off text, and Task 2 copies it verbatim. Three
> things were decided at the gate:
>
> 1. A superseded fact **may** be corrected, but only when the update states the newer value
>    outright, only on the line it touches, and never in preference to adding. Rule 1 carries that
>    as a narrow exception with "be very wary of it".
> 2. **No new sections, ever.** The update lands under an existing heading even when the fit is
>    loose. Rule 2 forbids adding, reordering and re-nesting headings outright.
> 3. Skills stay **uninferred** - the user names them in the update when they are meant. Rule 3 is
>    unchanged from the draft and says so explicitly.
>
> The consequence of decision 1: a genuine supersession shows in the review panel as struck-through
> text with a non-zero `removed` count and the "meant to add only" warning. That is the safety net
> working - the old wording is on screen before the save. A non-zero count on a plain *addition*
> still means the prompt is misbehaving.

**Interfaces:**

- Consumes: nothing.
- Produces: the approved text of `ENRICH_SYSTEM` and `ENRICH_TASK`, recorded in this document. Task
  2 copies them into `backend/app/ai.py` verbatim.

**Why this gate exists:** the prompt is the one part of this feature no test can check. The suites
all run against a stub, so a prompt that quietly rewords the user's profile would pass every check
in this plan and only show up in the saved document. A human reads it before it ships.

- [x] **Step 1: Read the two constants below in full**

```python
ENRICH_SYSTEM = (
    "You maintain one job seeker's profile document. You fold new information into it and change "
    "nothing else. You are an editor with a narrow remit, not a writer."
)

ENRICH_TASK = """Fold the update into the profile and return the whole profile back.

Rules, most important first:

1. Add only, with one narrow exception. Every line of the current profile must come back word for
   word. You may extend a line - append a skill to a list that is already there. The exception:
   where the update explicitly supplies a newer value for something a line already states - a job
   that has ended, a count of years that has grown, a title that changed - that one line may be
   brought up to date, and nothing else may. Be very wary of it. It applies only when the update
   states the newer value outright, never when it merely implies one, and if the update can be
   honoured by adding then add. Never reword, reorder, merge or summarise a line for any other
   reason, and never drop one.
2. Never change the structure. Same sections in the same order, same headings spelled the same way,
   same list style, same register. Do not add a heading, do not start a new section, do not reorder
   or re-nest anything. Put the new information under the existing heading it fits best, even when
   the fit is loose. If the profile has no headings at all, add to it in the shape it already has.
3. Add only what the update states. No inferred skills, no invented dates, no padding, and no
   restating something the profile already covers. An update naming a course earns that course, not
   the skills a course like that usually implies - the skills will be named when they are meant.
4. Write in the profile's own voice and language. Match the lines around it: a fragment where its
   neighbours are fragments, French where the profile is in French.
5. Return the profile text and nothing else. No preamble, no summary of what you changed, no code
   fence, and no Markdown that was not already there.

If the current profile is empty, the update is all you have: write a first version from it, in the
update's own words, and invent no structure you were not given.

<current_profile>
{profile}
</current_profile>

<update>
{instruction}
</update>"""
```

- [x] **Step 2: Put the prompt to the user and STOP**

Show both constants verbatim - not a paraphrase, not a summary - and ask these three questions. Then
wait. Do not create a branch, edit a file, or begin Task 2 before an answer arrives.

1. **Rule 1 forbids all rewording.** An update that supersedes something ("I left Acme in July")
   will therefore be *added* rather than *corrected*, and the profile can end up contradicting
   itself. Keep it strict, or allow the model to change the one line a superseded fact touches?
2. **Rule 2 allows a new section** when nothing fits. Is that the right escape hatch, or should
   everything land under an existing heading even when it fits badly?
3. **Rule 3 forbids inferring skills** from a course or a project. Is that what you want, or would
   you rather a named course expanded into the skills it implies?

- [x] **Step 3: Apply the user's edits and show the result again**

Repeat until the user states the prompt is approved. Ambiguous approval is not approval; ask again.

If the answer to question 1 loosens rule 1, nothing else in the plan changes: the diff still marks
whatever the model replaced, and the removal counter still puts a warning above the Save button.

- [x] **Step 4: Record the approved text in this document**

Replace the code block in Step 1 with the approved version, so Task 2 copies from an approved source
and a future reader can see what was signed off.

```bash
git add .agents/plans/19-08-2026-profile-ai-enrichment.md
git commit -m "$(cat <<'EOF'
Record the approved profile rewrite prompt

The rewrite prompt is the one part of the feature no test covers: every suite
runs against a stub, so a prompt that quietly rewords the profile would pass
each check and only show up in the saved document. It was reviewed by hand
before any code was written, and the approved text now lives in the plan.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: The backend enrich endpoint

**Files:**

- Modify: `backend/app/schemas.py`, `backend/app/ai.py`, `backend/app/routers/profile.py`
- Modify: `backend/tests/conftest.py`, `backend/tests/test_profile.py`, `backend/tests/test_ai.py`,
  `backend/tests/test_applications.py`
- Regenerate: `backend/openapi.json`

**Interfaces:**

- Consumes: the approved prompt from Task 1. `client`, `settings` and the `Callable`/`Annotated`/
  `Depends` imports already at the top of `app/ai.py`.
- Produces:
  - `POST /profile/enrich`, body `{"content": str, "instruction": str}` (instruction `min_length=1`),
    response `{"content": str}`, status 200.
  - `Enricher = Callable[[str, str], str]`, called as `enricher(content, instruction)`.
  - `get_enricher()` and `EnricherDep`, the FastAPI dependency Task 2's tests override.
  - `stub_enrich(profile, instruction) -> str`, which Playwright relies on in Task 5.
  - Pydantic models `ProfileEnrich` and `ProfileDraft`, which become the TypeScript types Task 4
    imports.

- [x] **Step 1: Write the failing tests**

Add to the end of `backend/tests/test_profile.py`:

```python
INSTRUCTION = "I passed the AWS Solutions Architect Associate exam in August 2026."


async def test_enrich_returns_the_draft_the_model_wrote(client, stub_enricher):
    stub_enricher("Nicolas, engineer.\nAWS Solutions Architect Associate, Aug 2026")

    response = await client.post(
        "/profile/enrich", json={"content": "Nicolas, engineer.", "instruction": INSTRUCTION}
    )

    assert response.status_code == 200
    assert response.json() == {
        "content": "Nicolas, engineer.\nAWS Solutions Architect Associate, Aug 2026"
    }


async def test_enrich_is_handed_the_editor_text_not_the_stored_row(client, stub_enricher):
    """The draft on screen is what gets enriched, so a second instruction builds on the first."""
    calls = stub_enricher()
    await client.put("/profile", json={"content": "Stored, and out of date."})

    await client.post(
        "/profile/enrich", json={"content": "Edited, not saved.", "instruction": INSTRUCTION}
    )

    assert calls == [("Edited, not saved.", INSTRUCTION)]


async def test_enrich_stores_nothing(client, stub_enricher):
    stub_enricher("A draft nobody has agreed to.")
    await client.put("/profile", json={"content": "Nicolas, engineer."})

    await client.post(
        "/profile/enrich", json={"content": "Nicolas, engineer.", "instruction": INSTRUCTION}
    )

    assert (await client.get("/profile")).json()["content"] == "Nicolas, engineer."


async def test_enrich_writes_a_first_version_from_an_empty_profile(client, stub_enricher):
    """There is nothing to protect, so an empty profile is enriched rather than refused."""
    calls = stub_enricher("AWS Solutions Architect Associate, Aug 2026")

    response = await client.post(
        "/profile/enrich", json={"content": "", "instruction": INSTRUCTION}
    )

    assert response.status_code == 200
    assert response.json()["content"] == "AWS Solutions Architect Associate, Aug 2026"
    assert calls == [("", INSTRUCTION)]


async def test_enrich_rejects_an_empty_instruction(client, stub_enricher):
    stub_enricher()

    response = await client.post(
        "/profile/enrich", json={"content": "Nicolas, engineer.", "instruction": ""}
    )

    assert response.status_code == 422
```

Add to the end of `backend/tests/test_ai.py`, and extend its import line to
`from app.ai import half_step, stub_enrich`:

```python
def test_the_stub_enricher_appends_one_line_carrying_the_instruction():
    assert stub_enrich("Nicolas, engineer.", "Learned Rust") == (
        "Nicolas, engineer.\nAdded by the stub: Learned Rust"
    )


def test_the_stub_enricher_leaves_no_blank_first_line_on_an_empty_profile():
    assert stub_enrich("", "Learned Rust") == "Added by the stub: Learned Rust"
```

Add the fixture to `backend/tests/conftest.py`, next to `stub_analyser`, and extend the ai import to
`from app.ai import get_analyser, get_enricher`:

```python
@pytest.fixture
def stub_enricher():
    """Swaps the OpenAI call for a recorder, so tests can assert what the model was handed."""

    calls: list[tuple[str, str]] = []

    def _install(answer: str = "Nicolas, engineer.\nAWS, Aug 2026") -> list[tuple[str, str]]:
        def enricher(content: str, instruction: str) -> str:
            calls.append((content, instruction))
            return answer

        app.dependency_overrides[get_enricher] = lambda: enricher
        return calls

    yield _install
    app.dependency_overrides.pop(get_enricher, None)
```

In `backend/tests/test_applications.py`, add one line to the set in
`test_openapi_exposes_exactly_the_expected_routes`, after `("/profile", "PUT"),`:

```python
        ("/profile/enrich", "POST"),
```

and one line to the parametrize list in `test_every_application_route_requires_the_api_key`, after
`("PUT", "/profile"),`:

```python
        ("POST", "/profile/enrich"),
```

- [x] **Step 2: Run the tests to verify they fail**

```bash
cd backend && uv run pytest tests/test_profile.py tests/test_ai.py -q
```

Expected: the five profile tests fail with 404 (the route does not exist), the two `test_ai.py` tests
fail at import with `ImportError: cannot import name 'stub_enrich'`.

- [x] **Step 3: Add the two schemas**

In `backend/app/schemas.py`, directly after the existing `ProfileRead` class:

```python
class ProfileEnrich(BaseModel):
    """The profile as the editor currently holds it, and what to fold into it."""

    content: str
    instruction: str = Field(min_length=1)


class ProfileDraft(BaseModel):
    """A proposed profile. Stored nowhere - the user has not agreed to it yet."""

    content: str
```

- [x] **Step 4: Add the prompt, the call, the stub and the dependency**

Append to `backend/app/ai.py`, after `AnalyserDep`. The text below is the one **approved at the
Task 1 gate**; copy it verbatim, including rule 1's exception and rule 2's outright ban on new
headings:

```python
ENRICH_SYSTEM = (
    "You maintain one job seeker's profile document. You fold new information into it and change "
    "nothing else. You are an editor with a narrow remit, not a writer."
)

ENRICH_TASK = """Fold the update into the profile and return the whole profile back.

Rules, most important first:

1. Add only, with one narrow exception. Every line of the current profile must come back word for
   word. You may extend a line - append a skill to a list that is already there. The exception:
   where the update explicitly supplies a newer value for something a line already states - a job
   that has ended, a count of years that has grown, a title that changed - that one line may be
   brought up to date, and nothing else may. Be very wary of it. It applies only when the update
   states the newer value outright, never when it merely implies one, and if the update can be
   honoured by adding then add. Never reword, reorder, merge or summarise a line for any other
   reason, and never drop one.
2. Never change the structure. Same sections in the same order, same headings spelled the same way,
   same list style, same register. Do not add a heading, do not start a new section, do not reorder
   or re-nest anything. Put the new information under the existing heading it fits best, even when
   the fit is loose. If the profile has no headings at all, add to it in the shape it already has.
3. Add only what the update states. No inferred skills, no invented dates, no padding, and no
   restating something the profile already covers. An update naming a course earns that course, not
   the skills a course like that usually implies - the skills will be named when they are meant.
4. Write in the profile's own voice and language. Match the lines around it: a fragment where its
   neighbours are fragments, French where the profile is in French.
5. Return the profile text and nothing else. No preamble, no summary of what you changed, no code
   fence, and no Markdown that was not already there.

If the current profile is empty, the update is all you have: write a first version from it, in the
update's own words, and invent no structure you were not given.

<current_profile>
{profile}
</current_profile>

<update>
{instruction}
</update>"""


def enrich(profile: str, instruction: str) -> str:
    """The profile with the update folded in. Plain text out: the answer is the document itself,
    so there is no object to parse."""
    response = client.responses.create(
        model=settings.openai_model,
        input=[
            {"role": "system", "content": ENRICH_SYSTEM},
            {
                "role": "user",
                "content": ENRICH_TASK.format(profile=profile, instruction=instruction),
            },
        ],
    )
    return response.output_text.strip()


def stub_enrich(profile: str, instruction: str) -> str:
    """Appends one line, so the end-to-end diff has both untouched and added text to show."""
    return f"{profile}\nAdded by the stub: {instruction}".strip()


Enricher = Callable[[str, str], str]


def get_enricher() -> Enricher:
    if settings.ai_stub:
        return stub_enrich
    return enrich


EnricherDep = Annotated[Enricher, Depends(get_enricher)]
```

- [x] **Step 5: Add the route**

In `backend/app/routers/profile.py`, extend the imports and append the route:

```python
from app.ai import EnricherDep
from app.schemas import ProfileDraft, ProfileEnrich, ProfileRead, ProfileWrite
```

```python
@router.post("/enrich", response_model=ProfileDraft)
def enrich_profile(payload: ProfileEnrich, enricher: EnricherDep):
    """Folds an instruction into the text it was handed. Reads and writes no row: the draft is the
    caller's until the user saves it through PUT."""
    return ProfileDraft(content=enricher(payload.content, payload.instruction))
```

There is no `SessionDep` here on purpose. The endpoint touches no database state, and adding one
would invite a future reader to read the stored profile instead of the one on screen.

- [x] **Step 6: Run the tests to verify they pass**

```bash
cd backend && uv run pytest -q && uv run ruff format . && uv run ruff check .
```

Expected: 100 passed, up from the 92 in the baseline - five profile tests, two stub tests, and one
more case in the parametrized auth test. `ruff` clean.

- [x] **Step 7: Regenerate the committed API schema**

```bash
cd backend && uv run python -m scripts.export_openapi
git diff --stat backend/openapi.json
```

Expected: `openapi.json` gains the `/profile/enrich` path and the `ProfileEnrich` and `ProfileDraft`
component schemas. If it is unchanged, the route was not mounted - check the prefix.

- [x] **Step 8: Commit**

```bash
git add backend/app backend/tests backend/openapi.json
git commit -m "$(cat <<'EOF'
Fold a plain-English update into the profile

The profile screen could only be edited by hand. POST /profile/enrich takes the
text the editor currently holds plus an instruction and returns the whole
profile with the update folded in, additively.

It reads and writes no row. The draft belongs to the browser until the user
saves it through PUT /profile, which means a second instruction builds on an
unsaved draft rather than on the stored version, and a rewrite nobody agrees to
leaves no trace.

The model call sits behind the same dependency seam the advert analyser uses, so
AI_STUB swaps it for a fixed answer and the suites never reach OpenAI.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: The diff helper

**Files:**

- Modify: `frontend/package.json` (add `diff`)
- Create: `frontend/src/lib/profile-diff.ts`
- Create: `frontend/src/lib/profile-diff.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:

  ```ts
  export type Piece = { text: string; kind: "same" | "added" | "removed" };
  export type ProfileDiff = { pieces: Piece[]; addedWords: number; removedWords: number };
  export function diffProfile(before: string, after: string): ProfileDiff;
  ```

  Task 4's `ProfileDiffView` renders `pieces` and reads both counts.

- [ ] **Step 1: Add the dependency**

```bash
cd frontend && npm install diff
```

`diff` v9 ships its own TypeScript types. Do **not** install `@types/diff` - it is a deprecated stub
and npm will say so.

- [ ] **Step 2: Write the failing tests**

Create `frontend/src/lib/profile-diff.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { diffProfile, type Piece, type ProfileDiff } from "@/lib/profile-diff";

const PROFILE = "## Skills\nPython, FastAPI, Postgres\n\n## Experience\nSix years full stack";
const WITH_SECTION = `${PROFILE}\n\n## Certifications\nAWS Solutions Architect Associate`;
const EXTENDED_LINE = PROFILE.replace("FastAPI, Postgres", "FastAPI, Postgres, AWS");

/** The text of every piece of one kind, joined. Asserting on this rather than on the array is
 *  deliberate: how many pieces a run of added words is split into is jsdiff's business. */
function joined(diff: ProfileDiff, kind: Piece["kind"]): string {
  return diff.pieces
    .filter((piece) => piece.kind === kind)
    .map((piece) => piece.text)
    .join("");
}

describe("diffProfile", () => {
  it("reports nothing when the draft is untouched", () => {
    const diff = diffProfile(PROFILE, PROFILE);

    expect(diff.addedWords).toBe(0);
    expect(diff.removedWords).toBe(0);
    expect(joined(diff, "same")).toBe(PROFILE);
  });

  it("marks a whole new section as added", () => {
    const diff = diffProfile(PROFILE, WITH_SECTION);

    expect(diff.addedWords).toBe(5);
    expect(diff.removedWords).toBe(0);
    expect(joined(diff, "added")).toContain("## Certifications");
    expect(joined(diff, "added")).toContain("AWS Solutions Architect Associate");
  });

  it("marks only the appended words when an existing line is extended", () => {
    // One line out and one line in at line granularity, yet nothing was lost. Reporting a removal
    // here would put a warning on the commonest edit there is.
    const diff = diffProfile(PROFILE, EXTENDED_LINE);

    expect(diff.addedWords).toBe(1);
    expect(diff.removedWords).toBe(0);
    expect(joined(diff, "added")).toContain("AWS");
    expect(joined(diff, "added")).not.toContain("Postgres");
  });

  it("counts and marks what a rewrite dropped", () => {
    const withoutSkills = PROFILE.replace("Python, FastAPI, Postgres\n", "");

    const diff = diffProfile(PROFILE, withoutSkills);

    expect(diff.removedWords).toBe(3);
    expect(joined(diff, "removed")).toContain("Python, FastAPI, Postgres");
  });

  it("counts both sides when a line is reworded", () => {
    const diff = diffProfile(PROFILE, PROFILE.replace("Six years", "Seven years"));

    expect(diff.addedWords).toBe(1);
    expect(diff.removedWords).toBe(1);
    expect(joined(diff, "added")).toContain("Seven");
    expect(joined(diff, "removed")).toContain("Six");
  });

  it("treats a first version as all additions", () => {
    const diff = diffProfile("", "AWS Solutions Architect Associate");

    expect(diff.addedWords).toBe(4);
    expect(diff.removedWords).toBe(0);
    expect(joined(diff, "same")).toBe("");
    expect(joined(diff, "added")).toBe("AWS Solutions Architect Associate");
  });

  // The panel renders these pieces as the whole document, so anything the split loses is text the
  // user would never see. Dropping the removed pieces has to give the draft back exactly, and
  // dropping the added ones has to give the saved profile back exactly.
  it.each([
    ["a new section", PROFILE, WITH_SECTION],
    ["an extended line", PROFILE, EXTENDED_LINE],
    ["everything deleted", PROFILE, ""],
  ])("reassembles both sides after %s", (_case, before, after) => {
    const diff = diffProfile(before, after);

    expect(
      diff.pieces
        .filter((piece) => piece.kind !== "removed")
        .map((piece) => piece.text)
        .join(""),
    ).toBe(after);
    expect(
      diff.pieces
        .filter((piece) => piece.kind !== "added")
        .map((piece) => piece.text)
        .join(""),
    ).toBe(before);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd frontend && npm test -- profile-diff
```

Expected: the whole file fails to resolve `@/lib/profile-diff`.

- [ ] **Step 4: Write the helper**

Create `frontend/src/lib/profile-diff.ts`:

```ts
import { diffLines, diffWordsWithSpace, type Change } from "diff";

export type Piece = { text: string; kind: "same" | "added" | "removed" };

export type ProfileDiff = {
  /** The draft in order, split into runs of untouched, added and removed text. Every piece but the
   *  removed ones joins back into the draft; every piece but the added ones into the saved
   *  profile. */
  pieces: Piece[];
  addedWords: number;
  /** What the rewrite dropped. Meant to be zero, since a rewrite only adds, and what the panel
   *  warns about when it is not. */
  removedWords: number;
};

/** A word is a run starting with a letter or a digit, so `##` and a stray comma are punctuation
 *  rather than something added. */
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'-]*/gu;

function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0;
}

function kindOf(change: Change): Piece["kind"] {
  if (change.added) return "added";
  if (change.removed) return "removed";
  return "same";
}

/**
 * The saved profile against the draft: lines first, then words inside a line the rewrite replaced.
 * Line granularity alone would call appending `, AWS` to a skills list one line removed and one
 * line added, and a removal is exactly what the panel warns about, so the word pass is what keeps
 * that warning meaningful.
 */
export function diffProfile(before: string, after: string): ProfileDiff {
  const pieces: Piece[] = [];
  let addedWords = 0;
  let removedWords = 0;

  function take(change: Change) {
    if (change.value === "") return;
    const kind = kindOf(change);
    pieces.push({ text: change.value, kind });
    if (kind === "added") addedWords += countWords(change.value);
    if (kind === "removed") removedWords += countWords(change.value);
  }

  // No options: the values have to come back verbatim, or the pieces stop joining back into the
  // two documents they came from.
  const lines = diffLines(before, after);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const next = lines[index + 1];

    // Removed then added is one line rewritten, not a delete and an insert.
    if (line.removed && next?.added) {
      for (const word of diffWordsWithSpace(line.value, next.value)) take(word);
      index += 1;
      continue;
    }
    take(line);
  }

  return { pieces, addedWords, removedWords };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd frontend && npm test && npx tsc --noEmit && npm run lint
```

Expected: 30 passed, up from the 21 in the baseline - nine new cases. `tsc` and `eslint` clean.

If a reassembly case fails by exactly one trailing newline, `diffLines` is ignoring the newline at
end of file. Pass `{ ignoreNewlineAtEof: false }` as its third argument and rerun; do not "fix" the
test, the invariant is the point.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/lib/profile-diff.ts frontend/src/lib/profile-diff.test.ts
git commit -m "$(cat <<'EOF'
Compare a profile draft with the saved profile

diffProfile splits a draft into runs of untouched, added and removed text, so
the profile screen can show what a rewrite is about to change instead of asking
the user to spot it.

It diffs lines first and then words inside a line the rewrite replaced. Line
granularity alone reports appending a skill to an existing list as one line
removed and one line added, and a removal is what the UI warns about, so that
would put a warning on the commonest edit there is.

Words are counted as runs starting with a letter or a digit, which keeps a
Markdown heading marker from counting as something added.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: The profile screen

**Files:**

- Regenerate: `frontend/src/lib/api-types.ts`
- Modify: `frontend/src/lib/api.ts`, `frontend/src/app/profile/actions.ts`,
  `frontend/src/app/profile/page.tsx`
- Create: `frontend/src/components/profile-diff-view.tsx`
- Modify: `frontend/src/app/profile/profile-form.tsx`

**Interfaces:**

- Consumes: `POST /profile/enrich` from Task 2; `diffProfile`, `ProfileDiff` and `Piece` from Task 3.
- Produces:
  - `enrichProfile(content, instruction): Promise<ProfileDraft>` in `lib/api.ts`.
  - `enrichProfileAction(content, instruction): Promise<EnrichState>` where
    `EnrichState = { content?: string; error?: string }`.
  - `<ProfileDiffView diff={diff} />`, a `<section aria-label="Changes">`.
  - The profile form's accessible names, which Task 5 selects on: `AI mode` (switch),
    `What to add` (instruction textarea), `Candidate profile` (the profile textarea, unchanged),
    and the buttons `Rewrite profile`, `Save profile` (unchanged) and `Discard`.

- [ ] **Step 1: Regenerate the generated types**

```bash
cd frontend && npm run gen:types
git diff --stat src/lib/api-types.ts
```

Expected: `ProfileDraft` and `ProfileEnrich` appear in `components["schemas"]`. If not, Task 2's
`openapi.json` was not committed - go back and regenerate it.

- [ ] **Step 2: Add the API call**

In `frontend/src/lib/api.ts`, after the existing `Profile` type:

```ts
export type ProfileDraft = components["schemas"]["ProfileDraft"];
```

and after `putProfile`:

```ts
export function enrichProfile(content: string, instruction: string) {
  return call<ProfileDraft>("/profile/enrich", {
    method: "POST",
    body: JSON.stringify({ content, instruction }),
  });
}
```

- [ ] **Step 3: Add the Server Action**

Replace `frontend/src/app/profile/actions.ts` with:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { enrichProfile, putProfile } from "@/lib/api";

export type ProfileState = { saved?: boolean };

export async function saveProfileAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  await putProfile(String(formData.get("content") ?? ""));
  revalidatePath("/", "layout");
  return { saved: true };
}

export type EnrichState = { content?: string; error?: string };

/** No revalidatePath: nothing was written. The draft is the browser's until the user saves it. */
export async function enrichProfileAction(
  content: string,
  instruction: string,
): Promise<EnrichState> {
  if (!instruction.trim()) return { error: "Say what to add first" };
  try {
    const draft = await enrichProfile(content, instruction);
    return { content: draft.content };
  } catch (error) {
    // The browser gets a sentence, not a stack trace; the server log keeps the detail.
    console.error(error);
    return { error: "The rewrite failed. Try again." };
  }
}
```

- [ ] **Step 4: Write the diff panel**

Create `frontend/src/components/profile-diff-view.tsx`:

```tsx
import type { ProfileDiff } from "@/lib/profile-diff";

function words(count: number): string {
  return `${count} ${count === 1 ? "word" : "words"}`;
}

/** The draft against the saved profile: untouched text plain, additions marked, anything the
 *  rewrite dropped struck through. `ins` and `del` carry that on their own, so emerald and rose
 *  reinforce the signal rather than being it. Presentational only - no "use client" and no
 *  server-only import, so the client form can render it. */
export function ProfileDiffView({ diff }: { diff: ProfileDiff }) {
  const untouched = diff.addedWords === 0 && diff.removedWords === 0;

  return (
    <section aria-label="Changes" className="space-y-3 rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">
        {untouched
          ? "Nothing changed. Say more about what to add, or edit the profile yourself."
          : `${words(diff.addedWords)} added, ${diff.removedWords} removed`}
      </p>
      {diff.removedWords > 0 && (
        <p className="text-sm text-rose-600 dark:text-rose-400">
          A rewrite is meant to add only. Check the struck-through text before saving.
        </p>
      )}
      <div className="max-h-96 overflow-y-auto text-sm break-words whitespace-pre-wrap">
        {diff.pieces.map((piece, index) => {
          if (piece.kind === "added") {
            return (
              <ins key={index} className="bg-emerald-500/20 no-underline">
                {piece.text}
              </ins>
            );
          }
          if (piece.kind === "removed") {
            return (
              <del key={index} className="bg-rose-500/20">
                {piece.text}
              </del>
            );
          }
          return <span key={index}>{piece.text}</span>;
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Rewrite the form**

Replace `frontend/src/app/profile/profile-form.tsx` with:

```tsx
"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useMemo, useState, useTransition } from "react";

import { enrichProfileAction, saveProfileAction, type ProfileState } from "@/app/profile/actions";
import { ProfileDiffView } from "@/components/profile-diff-view";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { diffProfile } from "@/lib/profile-diff";

export function ProfileForm({ content }: { content: string }) {
  const [state, submit, pending] = useActionState<ProfileState, FormData>(saveProfileAction, {});
  const [aiMode, setAiMode] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState(content);
  const [proposed, setProposed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rewriting, startRewrite] = useTransition();
  const [saved, setSaved] = useState(content);

  // A save sends the new profile back down, and that ends the review: the draft rebases onto it and
  // the AI panel closes. Remounting on a key would do the same and would also throw away
  // useActionState, and with it the "Saved." confirmation.
  if (saved !== content) {
    setSaved(content);
    setDraft(content);
    setProposed(false);
    setInstruction("");
  }

  // Recomputed on every keystroke: hand-editing the draft is part of reviewing it, so the diff has
  // to follow the edit rather than freeze on what the model returned.
  const diff = useMemo(() => diffProfile(content, draft), [content, draft]);
  const editable = !aiMode || (proposed && !rewriting);

  function rewrite() {
    setError(null);
    startRewrite(async () => {
      const result = await enrichProfileAction(draft, instruction);
      if (result.content === undefined) {
        setError(result.error ?? "The rewrite failed. Try again.");
        return;
      }
      setDraft(result.content);
      setProposed(true);
    });
  }

  function discard() {
    setDraft(content);
    setProposed(false);
    setInstruction("");
    setError(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Switch id="ai-mode" checked={aiMode} onCheckedChange={setAiMode} disabled={rewriting} />
        <Label htmlFor="ai-mode" className="text-sm font-normal">
          AI mode
        </Label>
        <span className="text-sm text-muted-foreground">
          Say what to add and let it fold the update in
        </span>
      </div>

      {aiMode && (
        <div className="space-y-3 rounded-lg border p-4">
          <Label htmlFor="instruction">What to add</Label>
          <Textarea
            id="instruction"
            rows={3}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            disabled={rewriting}
            placeholder="I finished the AWS Solutions Architect course, so add it to my certifications."
          />
          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={rewrite}
              disabled={rewriting || instruction.trim() === ""}
            >
              {rewriting && <Loader2 className="animate-spin" aria-hidden />}
              {rewriting ? "Rewriting..." : "Rewrite profile"}
            </Button>
            {rewriting && (
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
        </div>
      )}

      {aiMode && proposed && <ProfileDiffView diff={diff} />}

      <form action={submit} className="space-y-4">
        <Textarea
          id="content"
          name="content"
          aria-label="Candidate profile"
          rows={24}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          // readOnly, not disabled: a disabled field submits nothing, and this one carries the whole
          // profile, so saving from AI mode would blank it.
          readOnly={!editable}
          className={editable ? undefined : "text-muted-foreground"}
          placeholder="Your background, skills, what you have shipped, what you are looking for."
        />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save profile"}
          </Button>
          {proposed && (
            <Button
              type="button"
              variant="ghost"
              onClick={discard}
              disabled={pending || rewriting}
            >
              Discard
            </Button>
          )}
          {state.saved && !pending && <p className="text-sm text-muted-foreground">Saved.</p>}
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 6: Update the screen's description**

In `frontend/src/app/profile/page.tsx`, replace the paragraph under the heading:

```tsx
        <p className="mb-6 text-sm text-muted-foreground">
          Your background, in your own words. A job advert is scored against this, so the more it
          says about what you have actually built, the more the score is worth. AI mode folds an
          update into it for you, additively, and shows you what changed before anything is saved.
        </p>
```

- [ ] **Step 7: Check it compiles and the suites still pass**

```bash
cd frontend && npx tsc --noEmit && npm run lint && npm test
```

Expected: all clean, Vitest still at 30. No new Vitest cases here - `AGENTS.md` limits Vitest to real
frontend logic, and every part of this task is either a render or a call. Task 5 covers the flow.

- [ ] **Step 8: Drive it by hand with the stub**

Two terminals, and `AI_STUB=true` so this costs nothing and is deterministic:

```bash
cd backend && AI_STUB=true uv run fastapi dev app/main.py
cd frontend && npm run dev
```

At `http://localhost:3000/profile`, confirm each of these:

- Manual mode is the default and behaves exactly as before: type, save, see `Saved.`, reload.
- Turning `AI mode` on locks the profile box (the cursor still selects text, nothing types) and
  offers `What to add`. `Rewrite profile` is disabled while that box is empty.
- A rewrite shows the `Changes` panel: the appended stub line is highlighted, the rest is plain, the
  count reads `... added, 0 removed`, and the profile box is editable and holds the whole draft.
- Deleting a line in the profile box updates the panel as you type: the deleted text appears struck
  through and the warning about adding only shows up.
- `Discard` puts the saved profile back and closes the panel.
- `Save profile` writes the draft, shows `Saved.`, and the panel closes. Reload confirms it.
- Toggle the theme. The added and removed backgrounds are legible in both.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/api-types.ts frontend/src/app/profile frontend/src/components/profile-diff-view.tsx
git commit -m "$(cat <<'EOF'
Add an AI mode to the profile screen

The profile could only be maintained by hand. AI mode takes a plain-English
update, sends the text the editor holds along with it, and shows the rewrite as
a diff over the saved profile before anything is written.

The draft stays editable while it is being reviewed and the diff is recomputed
on every keystroke, so a hand edit is shown in the same terms the rewrite was.
Removed text is struck through and counted, which is the only thing standing
between an additive prompt and a quiet loss.

The profile box is readOnly rather than disabled while there is nothing to
review. A disabled field submits nothing, and this one carries the whole
profile, so a save from AI mode would have blanked it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: End to end

**Files:**

- Modify: `frontend/e2e/helpers.ts`, `frontend/e2e/ai-mode.spec.ts`
- Create: `frontend/e2e/profile-ai.spec.ts`

**Interfaces:**

- Consumes: the accessible names Task 4 produced, and `stub_enrich` from Task 2 - the backend under
  Playwright already runs with `AI_STUB=true`, set in `playwright.config.ts`, so no config change is
  needed here.
- Produces: `saveProfile(page, content)` exported from `e2e/helpers.ts`.

- [ ] **Step 1: Move `saveProfile` into the shared helpers**

Cut the local `saveProfile` out of `frontend/e2e/ai-mode.spec.ts` and add it to
`frontend/e2e/helpers.ts`:

```ts
export async function saveProfile(page: Page, content: string) {
  await page.goto("/profile");
  await page.getByLabel("Candidate profile").fill(content);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
}
```

Then fix the import at the top of `ai-mode.spec.ts`:

```ts
import { saveProfile, STORAGE_STATE } from "./helpers";
```

`ai-mode.spec.ts` no longer needs its `type Page` import if nothing else in the file uses it -
`npm run lint` will say so.

- [ ] **Step 2: Write the failing spec**

Create `frontend/e2e/profile-ai.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

import { saveProfile, STORAGE_STATE } from "./helpers";

test.use({ storageState: STORAGE_STATE });

const PROFILE = "## Skills\nPython, FastAPI, Postgres\n\n## Experience\nSix years full stack";
const INSTRUCTION = "I passed the AWS Solutions Architect exam.";
const ADDED = `Added by the stub: ${INSTRUCTION}`;

/** Turns AI mode on with the profile already saved, asks for a rewrite, and waits for the panel.
 *  Returns nothing: every test then reads the page for itself. */
async function rewrite(page: Page) {
  await page.getByLabel("AI mode").click();
  await page.getByLabel("What to add").fill(INSTRUCTION);
  await page.getByRole("button", { name: "Rewrite profile" }).click();
  await expect(page.getByRole("region", { name: "Changes" })).toBeVisible();
}

test("AI mode locks the profile box and asks what to add instead", async ({ page }) => {
  await saveProfile(page, PROFILE);

  // Neither the instruction box nor the panel exists until AI mode is on.
  await expect(page.getByLabel("What to add")).toBeHidden();
  await expect(page.getByRole("region", { name: "Changes" })).toBeHidden();
  await page.getByLabel("AI mode").click();

  await expect(page.getByLabel("What to add")).toBeVisible();
  await expect(page.getByLabel("Candidate profile")).not.toBeEditable();
  // Nothing to fold in yet, so there is nothing to ask for.
  await expect(page.getByRole("button", { name: "Rewrite profile" })).toBeDisabled();
});

test("a rewrite is reviewed as a diff and saved from the box", async ({ page }) => {
  await saveProfile(page, PROFILE);
  await rewrite(page);

  const changes = page.getByRole("region", { name: "Changes" });
  await expect(changes.locator("ins")).toContainText(ADDED);
  await expect(changes.getByText(/added, 0 removed/)).toBeVisible();
  // The whole draft is in the box, and the box is editable again.
  const box = page.getByLabel("Candidate profile");
  await expect(box).toHaveValue(`${PROFILE}\n${ADDED}`);
  await expect(box).toBeEditable();

  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Candidate profile")).toHaveValue(`${PROFILE}\n${ADDED}`);
});

test("hand-editing the draft re-diffs it and warns about what was dropped", async ({ page }) => {
  await saveProfile(page, PROFILE);
  await rewrite(page);

  // Drop a line the rewrite left alone. The diff is recomputed as the box is typed into, so this
  // is the removal path without a stub that removes anything.
  await page
    .getByLabel("Candidate profile")
    .fill(`## Skills\n\n## Experience\nSix years full stack\n${ADDED}`);

  const changes = page.getByRole("region", { name: "Changes" });
  await expect(changes.locator("del")).toContainText("Python, FastAPI, Postgres");
  await expect(changes.getByText("A rewrite is meant to add only")).toBeVisible();
  // The addition is still shown as an addition.
  await expect(changes.locator("ins")).toContainText(ADDED);
});

test("Discard puts the saved profile back", async ({ page }) => {
  await saveProfile(page, PROFILE);
  await rewrite(page);

  await page.getByRole("button", { name: "Discard" }).click();

  await expect(page.getByRole("region", { name: "Changes" })).toBeHidden();
  await expect(page.getByLabel("Candidate profile")).toHaveValue(PROFILE);
  await expect(page.getByLabel("Candidate profile")).not.toBeEditable();
  await expect(page.getByLabel("What to add")).toHaveValue("");
});
```

- [ ] **Step 3: Run the spec to verify it fails, then passes**

```bash
cd frontend && npx playwright test profile-ai
```

If Task 4 is in place this passes first time; run it before Task 4's commit if you want it to fail
first. The one thing to watch is the `toHaveValue` assertion - it is exact, so a stub that appended
a different string, or a `strip()` lost from `stub_enrich`, shows up here.

- [ ] **Step 4: Run the whole end-to-end suite**

```bash
cd frontend && npx playwright test
```

Expected: 23 passed, up from the 19 in the baseline. The suite shares one database and one profile
row, and each test writes the profile it needs first, so order does not matter - but `workers: 1`
and `fullyParallel: false` are what make that true. Do not "speed it up" by changing them.

- [ ] **Step 5: Commit**

```bash
git add frontend/e2e
git commit -m "$(cat <<'EOF'
Cover the profile rewrite end to end

Four cases through both services: AI mode locking the profile box and asking
what to add, a rewrite reviewed as a diff and saved, a hand edit re-diffing the
draft and raising the removed-text warning, and Discard restoring the saved
profile.

The removal path is exercised by deleting a line in the box rather than by a
stub that drops one. That keeps a test-only special case out of the backend and
proves the live recompute at the same time.

saveProfile moves into the shared helpers, since both AI specs now need it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Bring the spec up to date

**Files:**

- Modify: `AGENTS.md`, `README.md`

**Interfaces:**

- Consumes: everything above. This task documents what shipped; it changes no behaviour.
- Produces: nothing code depends on.

- [ ] **Step 1: Rewrite screen 5 in the `Screens` list**

Replace the `5. **Profile**` bullet with:

```markdown
5. **Profile** - one textarea holding the candidate's background, reached from the header. AI mode
   scores adverts against it. Empty until written, which is a supported state, not an error.
   A `Manual` / `AI mode` toggle sits above it: manual mode edits the text directly, AI mode locks
   the textarea and takes a plain-English update instead ("I finished the AWS course"), then shows
   the rewritten profile as a diff over the saved one. The draft stays editable while it is being
   reviewed and the diff follows the edit, so a hand correction is shown in the same terms the
   rewrite was. Nothing is written until `Save profile`.
```

- [ ] **Step 2: Add the route to the API table**

After the `PUT /profile` row:

```markdown
| `POST`   | `/profile/enrich`                              | Fold a plain-English update into a profile        |
```

And below the table, after the paragraph about status updates, add:

```markdown
`/profile/enrich` reads and writes no row. It is handed the text the editor currently holds, not the
stored profile, so a second instruction builds on a draft nobody has saved yet, and a rewrite the
user rejects leaves no trace.
```

- [ ] **Step 3: Extend the testing focus**

In the **pytest** list, after the analyser bullet:

```markdown
- What the enricher is handed: the text from the request body and the instruction, with the same
  recorder treatment. That the enrich call stores nothing, and that an empty profile is enriched
  into a first version rather than refused
```

In the **Vitest** list, change the opening sentence to name the third piece of real logic:

```markdown
**Vitest** - only where real logic exists on the frontend: status-to-colour mapping, date
formatting, and the profile diff. The diff's own test asserts an invariant rather than a rendering:
dropping the removed pieces has to give the draft back exactly, and dropping the added ones the
saved profile, since those pieces are the whole document the panel renders.
```

In the **Playwright** list, add to the end of the sentence:

```markdown
, and the profile's AI mode - a rewrite reviewed as a diff, a hand edit re-diffing it, and Discard
```

- [ ] **Step 4: Add the deferred decisions**

Append to the `Deferred decisions` list:

```markdown
- **Additive-only is a prompt rule, not a constraint.** Nothing in Python compares the rewrite with
  what went in. The frontend counts what was dropped and strikes it through, and saving anyway is
  allowed, because a model that reflows one line is not a reason to throw away a rewrite that was
  otherwise right. If a rewrite ever loses something the user does not notice, refusing the response
  in `app/ai.py` is the fix.
- **A draft lives only in the browser.** Navigating away loses it, there is no version history, and
  the instruction that produced it is not recorded anywhere. One user correcting their own document
  does not need an audit trail, and the diff already shows what a save is about to do.
- **The rewrite is one call and no retry.** A model that answers with a preamble or a code fence
  produces a diff full of noise, which the user can see and discard. Nothing strips it.
```

- [ ] **Step 5: Extend the `AI_STUB` note in the environment table**

The table's row for `AI_STUB` says `Test only. Playwright sets it to skip OpenAI`, which is still
true, but `backend/.env.example` says "Replaces the OpenAI call with a fixed answer". Change that
comment to cover both calls:

```
# Only Playwright sets this. Replaces the OpenAI calls with fixed answers.
```

- [ ] **Step 6: Update the README sentence about the key**

Replace the `OPENAI_API_KEY` paragraph:

```markdown
`OPENAI_API_KEY` is needed for AI mode, which reads a pasted job advert and scores it against the
profile written at `/profile`, and folds plain-English updates into that profile. The test suites
never call OpenAI, but the backend builds its client at import, so the variable has to be set for
anything to start.
```

- [ ] **Step 7: Commit**

```bash
git add AGENTS.md README.md backend/.env.example
git commit -m "$(cat <<'EOF'
Describe the profile's AI mode in the spec

The spec described a profile screen with one textarea and one save button, and
its API table had no enrich route. Screen 5, the API table, the pytest and
Vitest focus lists and the Playwright list now match what ships.

Three new deferred decisions record what was deliberately left out: additive
only is a prompt rule with a visible count rather than an enforced constraint,
a draft lives only in the browser with no history of it or of the instruction,
and nothing retries or tidies a badly formatted answer.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Done when

- [x] Task 1's prompt was approved by a human, and the approved text is in this document
- [ ] `cd backend && uv run pytest` - 100 pass
- [ ] `cd backend && uv run ruff format --check . && uv run ruff check .` - clean
- [ ] `cd frontend && npx tsc --noEmit && npm run lint && npm test` - clean, Vitest at 30
- [ ] `cd frontend && npx playwright test` - 23 pass
- [ ] No migration was written, and `git status` shows none: nothing new is stored
- [ ] `git status` shows no unexpected files staged, and the pre-existing dirty paths
      (`.gitignore`, `skills-lock.json`, `.agents/skills/caveman/`, `.agents/skills/writing-plans/`,
      `.claude/skills/caveman/`, `.claude/skills/writing-plans/`) are still untouched
- [ ] **A manual check against the real model**, both services running with `AI_STUB` unset and a
      real profile in place. This is the only step that exercises the approved prompt - everything
      above it runs against the stub. Ask for two updates in a row, one that belongs in a section
      that exists ("I finished the AWS Solutions Architect course") and one that fits nowhere well
      ("I now mentor two juniors"), and record here:
      - whether the removed count stayed at `0` for both
      - which existing heading the second one chose, since rule 2 forbids it a new one
      - whether the language and register of the additions match the profile around them
      - anything the model added that the instruction did not state

      Write the answers into this section. A non-zero removed count on a plain addition is the
      signal that rule 1 needs strengthening, and it is the reason the count is on screen at all. A
      supersession is the one case where the count is allowed to move.

## Deliberately not in this plan

Named so they read as decisions rather than oversights:

- **No `Undo` after saving.** Save writes over the profile, and the previous version is gone. The
  diff is the review step; there is no second one.
- **No streaming.** The rewrite arrives whole, behind a spinner, like the advert analyser.
- **No section-by-section accept.** The whole draft is accepted or discarded, and hand-editing the
  box covers the middle ground.
- **Nothing about the advert-scoring AI mode changes.** The two toggles share a name and nothing
  else.
