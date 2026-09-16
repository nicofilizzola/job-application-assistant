# Tailored CV - Implementation Plan

> **For agentic workers:** use the `executing-plans` skill to work through this plan task by task.
> Steps use checkbox (`- [ ]`) syntax for tracking. Tick them as you go.
>
> **Task 1 is a blocking human sign-off.** Nothing in Tasks 2-10 may be started until a human has
> approved the prompt text. If you find yourself editing `app/ai.py` before that approval, stop.

**Goal:** From a pasted job advert and the stored candidate profile, produce a one-page ATS resume
as copy-paste-ready plain text, written on the create form beside the existing autofill and
re-writable later from the detail screen.

**Architecture:** One new model call, `tailor(ad_text, profile) -> str`, sitting behind the same
dependency seam `analyse` and `enrich` already use, so `AI_STUB` swaps it out for Playwright. It is
reached through two routes, mirroring the two the match already has: `POST /job-ads/resume` writes a
CV for an advert that has no application yet and stores nothing, and `POST /applications/{id}/resume`
re-writes the stored advert into the new `applications.resume` column. On the create form the CV
rides along as a hidden field and is written with the application, exactly as `job_ad` and the four
match fields do today. The output is the document itself, so there is no structured object to parse
and nothing on the frontend derives anything from it.

**Tech Stack:** FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic, `openai` Python SDK (Responses API,
plain text output), pytest (backend); Next.js 16 App Router, Server Actions, Tailwind, shadcn/ui,
Playwright (frontend). One migration: one nullable text column. No new dependency on either side.

**Spec:** `AGENTS.md`. Read it before starting. It describes a create form whose AI mode fills fields
and scores a match, and an API table with no resume route. Task 10 rewrites the passages that go
stale. Until then the spec and this plan disagree on purpose, and the plan wins.

**Source prompt:** `local-testing/resume_prompt.md` - the prompt the user runs by hand in a chat
today. That directory is gitignored, so Task 1 carries the improved prompt inline and this plan is
the record of it.

## Decisions closed before planning

| Question                               | Answer                                                                                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| What the CV is assembled from          | The existing `profile` row alone. No second source document, no new screen. The profile is expected to grow until it carries what `local-testing/CONTEXT.md` carries today                                      |
| When the call runs                     | A second, explicit button beside `Fill the form`. Autofill stays exactly as fast as it is today, and a CV is only paid for on adverts worth applying to                                                         |
| Whether the CV is stored, and editable | Stored on the application in a new `resume` column, AI-owned and read-only, re-writable from the detail screen. `ApplicationPatch` gets no field for it, the same rule the match fields follow                  |
| Output shape                           | A full one-page ATS resume as plain text: header, summary, core skills, experience, education, certifications and languages. No Markdown                                                                       |
| Output language                        | The job advert's language. The model translates the profile's material where the two differ                                                                                                                    |
| What the call is handed                | The advert and the profile, nothing else. The match result does not steer it, so a CV can be written for an application that was never scored                                                                  |

## Decisions taken while planning

Technical, reversible, and flagged so they can be revisited rather than rediscovered.

| Decision                                                          | Reason                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Two routes, not one                                               | `POST /job-ads/resume` serves the create form, where there is no application id yet, and stores nothing. `POST /applications/{id}/resume` serves the detail screen and writes the column. Exactly the shape `/job-ads/analyse` and `/applications/{id}/match` already have, so the codebase keeps one pattern rather than growing a second |
| Plain text out, no structured output                              | The answer *is* the document. `enrich` already returns text for the same reason. A Pydantic model of sections would only be flattened back into a string before anyone read it                                                                                          |
| An empty profile is a `409` on both routes                        | A CV is assembled from the profile, so an empty one has nothing to assemble from. `/job-ads/analyse` returns nulls instead, because a missing score is a real renderable state - a missing CV is not                                                                    |
| `require_profile` is extracted and `score_match` switched onto it | Three callers now need "the profile, or a 409". The message stays byte-identical, so the existing match tests keep passing untouched                                                                                                                                    |
| The detail screen shows the CV in a flat panel, not a `<details>` | The panel caps itself at `max-h-96` and scrolls, and Copy is the point of the feature - burying it behind a click costs more than the vertical space saves. Nesting a bordered panel inside a bordered `<details>` also doubles the chrome. The raw advert stays collapsed, because nobody reads that on purpose |
| One `ResumePanel`, used on both screens                           | Same component on the create form and the detail screen, same as `MatchPanel`. It carries `"use client"` because Copy needs `navigator.clipboard`, and a client component imports cleanly into both a client form and a server page                                     |
| A `<pre>` with `whitespace-pre-wrap`, not a `<p>`                 | The model returns a laid-out document. Its blank lines and line breaks *are* the layout, and `whitespace-pre-line` on a `<p>` collapses runs of blank lines                                                                                                             |
| The two buttons are independent, not sequenced                    | Both are enabled as soon as the advert box has text. Requiring `Fill the form` first would add a state machine to buy nothing: the CV call reads the advert, not the extracted fields                                                                                   |
| The stub echoes the first 60 characters of the advert             | `stub_tailor` returns a fixed document plus the advert's opening, so the end-to-end suite proves the paste reached the backend rather than only that some text came back. `stub_enrich` echoes the instruction for the same reason                                       |
| No Vitest tests are added                                         | Nothing new on the frontend is logic. The CV is a string that arrives, is painted into a `<pre>`, and is copied. `AGENTS.md` is explicit that render-only components do not get tests written to reach a coverage number                                                 |
| `maxDuration` is raised on both services                          | A one-page generation against a large profile is a far longer call than a four-field extraction. It only bites in production, where the local suites cannot see it, so it is set deliberately rather than discovered                                                    |
| A CV written on the create form may reach the database as CRLF    | It rides a hidden form field, the same path `comment` and `job_ad` take. Nothing diffs a CV, so it is not normalised, consistent with the rule already in `AGENTS.md`                                                                                                   |
| The CV prompt opens with a role, the other two do not             | Following RISEN, `RESUME_SYSTEM` casts the model as a technical recruiter who screens and writes engineering CVs. `SYSTEM` and `ENRICH_SYSTEM` describe a function instead, and stay as they are: extraction and additive editing are mechanical, while selecting what belongs on a one-page CV and cutting the rest is a judgement, and a judgement needs someone qualified to make it |

## Global Constraints

Copied from `AGENTS.md`. Every task's requirements implicitly include these.

- **No emojis anywhere in the repo.** Not in code, comments, commits, or docs.
- UI, labels, statuses and code are in **English**. Existing free-text data is never translated. The
  CV the model writes is user content in the advert's language, and is the one exemption.
- Keep it simple. No over-engineering, no unnecessary defensive programming, no extra features.
- The browser never calls FastAPI. Every read and write goes browser -> Next -> FastAPI.
- Every FastAPI route except `/health` requires a matching `X-API-Key`.
- `revalidatePath` after every mutation, because Server Components hold the cached read. Writing a
  draft CV on the create form is **not** a mutation: it stores nothing, so it must not revalidate.
- `frontend/src/lib/api-types.ts` is **generated** and never hand-edited. `backend/openapi.json` is
  committed and regenerated whenever a Pydantic model changes.
- Backend is Python 3.13 run through `uv`, linted and formatted with `ruff`, line length 100.
- `pytest`, `alembic` and `scripts/export_openapi.py` all run **from `backend/`** - `env_file=".env"`
  resolves against the working directory.
- Spelling follows the repo's existing register: `analyse`, `colour`, `summarise`.
- Colour is never the only signal.
- Commit messages: imperative sentence-case title, body paragraphs saying why, and the trailer
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. No `feat:` prefixes - the
  repo does not use them.

## Before you start

- [x] Branch off `main`: `git switch -c tailored-resume`
- [x] Every commit step below uses an explicit `git add <paths>`. Never `git add -A`: the working
      tree may hold unrelated edits, and sweeping them into a commit is how a plan's history stops
      being reviewable.
- [x] Confirm the baseline is green before changing anything and **write the three counts down**:

      ```bash
      cd backend && uv run pytest            # 101 passed, measured 16 Sep 2026
      cd frontend && npm test                # 48 passed, measured 16 Sep 2026
      cd frontend && npx playwright test     # 30 tests in 7 files, listed 16 Sep 2026
      ```

      The Vitest number is from a real run. The pytest number is from `--collect-only`, because the
      suite needs `TEST_DATABASE_URL` and a live Neon branch, and the Playwright number is from
      `--list`. Every task below states how many tests it adds, and those numbers are only checkable
      against your own baseline. If yours differs, use yours.
- [x] If anything talking to Postgres hangs for a minute and then reports `server closed the
      connection unexpectedly`, disconnect Proton VPN before debugging anything else.
      `.agents/notes/local-database-access.md` has the confirming test.
- [x] Playwright starts both services itself. Do not start them by hand before `npm run test:e2e`.

## File Structure

| File                                              | Responsibility                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `backend/app/models.py`                           | Modify: the `resume` column on `Application`                                        |
| `backend/alembic/versions/<generated>.py`         | Create: add `applications.resume`                                                   |
| `backend/app/schemas.py`                          | Modify: `resume` on `ApplicationCreate` and `ApplicationDetail`; new `ResumeDraft`  |
| `backend/app/ai.py`                               | Modify: the CV prompt, `tailor`, `stub_tailor`, the tailor dependency                |
| `backend/app/routers/profile.py`                  | Modify: `require_profile`, shared by both CV routes and by the match route           |
| `backend/app/routers/job_ads.py`                  | Modify: `POST /job-ads/resume`                                                       |
| `backend/app/routers/applications.py`             | Modify: `POST /applications/{id}/resume`; `score_match` onto `require_profile`       |
| `backend/tests/conftest.py`                       | Modify: a `stub_tailor` recorder fixture                                             |
| `backend/tests/test_resume.py`                    | Create: the CV route contract tests                                                  |
| `backend/tests/test_ai.py`                        | Modify: two tests for the stub tailor                                                |
| `backend/tests/test_applications.py`              | Modify: three column tests, the route inventory, the auth parametrize list           |
| `backend/openapi.json`                            | Regenerate                                                                           |
| `backend/vercel.json`                             | Modify: `maxDuration`                                                                |
| `frontend/src/lib/api-types.ts`                   | Regenerate                                                                           |
| `frontend/src/lib/api.ts`                         | Modify: `tailorResume`, `writeResume`, the `ResumeDraft` type                        |
| `frontend/src/app/applications/actions.ts`        | Modify: `tailorResumeAction`, `writeResumeAction`, `resume` in `readAiFields`        |
| `frontend/src/components/resume-panel.tsx`        | Create: the CV block with its Copy button, used on both screens                      |
| `frontend/src/components/job-ad-analyser.tsx`     | Modify: the second button and its own pending state                                  |
| `frontend/src/components/application-form.tsx`    | Modify: the CV state, the panel, the hidden field                                    |
| `frontend/src/components/write-resume-button.tsx` | Create: the detail screen's write and re-write button                                |
| `frontend/src/app/applications/[id]/page.tsx`     | Modify: the panel, the button, `maxDuration`                                         |
| `frontend/src/app/applications/new/page.tsx`      | Modify: `maxDuration`                                                                |
| `frontend/e2e/ai-mode.spec.ts`                    | Modify: three end-to-end tests                                                       |
| `AGENTS.md`                                       | Modify: scope, screens, API table, schema, testing focus, deferred decisions         |
| `README.md`                                       | Modify: one sentence on what the OpenAI key now buys                                 |

---

### Task 1: The prompt - BLOCKING HUMAN SIGN-OFF

**Files:** none. **No code is written in this task.** Its deliverable is an approved block of
English, recorded in this document, which Task 3 then pastes into `backend/app/ai.py`.

**Interfaces:**

- Consumes: `local-testing/resume_prompt.md`, the prompt the user runs by hand today.
- Produces: the final text of `RESUME_SYSTEM` and `RESUME_TASK` as they appear in Step 3 of this
  task after sign-off. Task 3 copies them verbatim and may not reword them.

**Why this blocks.** The prompt is the feature. Everything downstream - two routes, a column, a
panel, ten tests - is plumbing around this text, and plumbing is cheap to change. A prompt nobody
agreed to is not: it writes the document the user actually sends to employers. Get the signature
first.

- [x] **Step 1: Read the source prompt**

Run: `cat "local-testing/resume_prompt.md"`

It asks for a one-page ATS resume tailored to a pasted advert, in three sections: a summary of at
most 510 characters, core skills of at most 620 characters written as `category: item, item.`
groups, and work experience where one role is expanded and the others are brief. It ends with the
advert under a `=== job advertisement ===` delimiter.

- [x] **Step 2: Understand what changes and why**

The source prompt was written for a chat thread that already held the candidate's context. Seven
things have to change for it to work as a server-side prompt:

1. **It opens by assigning a role.** This is the `R` of RISEN, and the source prompt has none - in
   a chat the assistant's role came from everything already said in the thread. `RESUME_SYSTEM`
   now casts the model as a technical recruiter who has screened engineering CVs and writes them,
   which is what makes rules 2 and 4 actionable: selection and skimmability are judgements, and a
   judgement needs someone making it. The role goes in the system message, where the other two
   prompts in `app/ai.py` already put theirs.
2. **It has to carry the profile.** In the chat the context was already in the thread. Here the
   profile arrives in the request, so the prompt has to receive it and be told it is the only
   permitted source of fact.
3. **"Invent nothing" has to become rule one.** The chat had a human reading every draft. This runs
   unattended and its output goes to employers, so the hardest rule in the prompt has to be that
   every employer, title, date, number and achievement already exists in the profile.
4. **"Give me the exact structure and word by word text"** is an instruction to a chat assistant
   that might otherwise describe a resume instead of writing one. Here the response *is* the
   document, so it becomes a rule about returning the text alone - the rule `ENRICH_TASK` already
   carries as its rule 5.
5. **"Two lines" has to become a character count.** The model cannot see a page or a line. Every
   budget is stated in characters, and they are ceilings rather than targets.
6. **The delimiter changes.** `=== job advertisement ===` becomes the `<job_advert>` and
   `<candidate_profile>` tags the other two prompts in `app/ai.py` already use.
7. **A language rule is added,** because the app will be fed adverts in French and German while the
   profile is in English.

- [x] **Step 3: Read the proposed prompt**

```python
RESUME_SYSTEM = (
    "You are a technical recruiter who has screened thousands of engineering CVs and now writes "
    "them. You know what an applicant tracking system can parse, what a hiring manager takes in "
    "during the six seconds before deciding whether to keep reading, and that the CV which earns "
    "the call is the one answering the advert's requirements in the advert's own order. You are "
    "given one job seeker's profile and one job advert, and you return a one-page resume "
    "assembled from that profile alone. You select and cut from a source document. You never "
    "write a career you were not given."
)

RESUME_TASK = """Write a one-page ATS resume for this advert, from the profile below. It has to
survive an automated parse and then convince the person reading it that this candidate is worth a
screening call, on evidence the profile already contains.

Rules, most important first:

1. Invent nothing. Every employer, title, date, technology, number and achievement must already be
   in the profile. You may cut, reorder, shorten and reword. You may not add a fact, inflate a
   number, promote exposure into experience, or name a tool the profile does not name. Where the
   advert asks for something the profile does not show, leave it out - do not imply it and do not
   hedge it into place.

2. Tailor by choosing, not by adding. Read what the advert asks for, then lead with the profile's
   material that answers it: pick the roles worth the space, put the matching bullets first, and
   drop what this employer has no reason to care about. Where the profile and the advert mean the
   same thing in different words, use the advert's words.

3. Keep to this structure and these budgets exactly. The budgets are in characters, and they are
   ceilings, not targets.

   The candidate's name alone on the first line.
   One headline line: the positioning the profile states, not a title invented for this advert.
   One line of location, mobility and work authorisation. One line of contact details. Both only as
   far as the profile states them - omit an item the profile does not give rather than writing a
   placeholder for it.

   SUMMARY - at most 510 characters. Three or four sentences, no bullets.

   CORE SKILLS - at most 620 characters. Four to six groups, each on its own line, written as
   "Group: item, item, item." Name the groups for what this advert cares about.

   EXPERIENCE - four roles, most recent first, unless the profile holds fewer. Each opens with a
   line reading "EMPLOYER - Title" and then a line reading "Location | Start - End". The single
   most relevant role gets four bullets of at most 220 characters each. The other three get one
   bullet of at most 220 characters each. Bullets open with "- ", start with a verb - past tense
   for a role that has ended, present tense for the current one - and carry a number wherever the
   profile gives one.

   EDUCATION - at most two lines per qualification: school and degree, then location and years.

   CERTIFICATIONS AND LANGUAGES - at most two lines in total.

4. Write to be skimmed. Short declarative lines. No filler, no adjective doing a verb's job, no
   "responsible for", no "proven track record", and never the same achievement in two sections.

5. Write the whole resume in the language of the job advert, translating the profile's material
   where the two differ. Do not leave one section in the profile's language.

6. Return the resume text and nothing else. Plain text: no Markdown, no bold, no code fence, no
   table, no column layout, no icon, no preamble, and no note about what you chose or why. Section
   headings in capitals on their own line, spelled exactly as above.

<candidate_profile>
{profile}
</candidate_profile>

<job_advert>
{ad_text}
</job_advert>"""
```

Note for whoever pastes this into `app/ai.py`: `RESUME_TASK` is filled with `str.format`, so
`{profile}` and `{ad_text}` are the only curly braces allowed anywhere in it. Adding a literal brace
turns every call into a `KeyError`.

- [x] **Step 4: Decide the seven flagged points**

These are places where the proposal goes beyond the source prompt, or resolves something the source
prompt leaves ambiguous. Each is a real choice. Mark each `keep` or `change`, and write any change
into the block in Step 3 before ticking Step 5.

| #   | Point                                                                                                                                                                                                                                                                                | Decision |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 1   | **"Four experiences, one expanded" is read as 1 + 3.** The source says "choose 4 experiences and expand on one... the other 4 should be quickly presented", which is five roles by one count and four by the other. The proposal reads it as four roles total: one expanded to four bullets, three brief with one bullet each | keep     |
| 2   | **"Two lines" is read as 220 characters.** A one-page resume line runs about 100-110 characters, so two lines is roughly 220. Nothing measures this; it is a number the model is asked to respect                                                                                      | keep     |
| 3   | **Three section groups the source prompt never names are added** - the header block, EDUCATION, and CERTIFICATIONS AND LANGUAGES. They are all in the assembled resume in `local-testing/CONTEXT.md`, so they look intended, but the source prompt does not ask for them              | keep     |
| 4   | **Core skills go on separate lines**, not in one paragraph. The source prompt's format string, `"category1: item1, item2. category2: ..."`, reads as a single run of text. Lines skim better and cost the same characters                                                              | keep     |
| 5   | **Bullets are marked with `- `, not the bullet character.** `CONTEXT.md` uses a real bullet. Both parse in practice; a hyphen is the safer of the two through an ATS and through a paste into any editor                                                                               | keep     |
| 6   | **Nothing enforces any budget in Python.** They are prompt rules, exactly as the 210-character match summary already is. A model that ignores one produces a long CV and the panel renders it                                                                                          | keep     |
| 7   | **There is no explicit `S` - no numbered working order.** Against RISEN the prompt now has `R` (the system message), `I` (the six rules), `E` (the opening sentence about surviving the parse and earning the call) and `N` (rules 1, 3, 5 and 6), but no "first read the advert's requirements, then pick the roles, then draft, then trim". The rules already run most-important-first, which encodes priority rather than procedure. Adding a steps block is one paragraph if it turns out the model drafts before it has read the advert properly | keep     |

- [x] **Step 5: Get explicit human sign-off**

Show the human the proposed prompt and the seven points. Do not paraphrase the prompt; show the text.
Wait for an explicit approval of *the prompt*. Approval of "the plan" is not approval of the prompt.

- [x] **Step 6: Record the approved text and commit**

Edit the code block in Step 3 of this file so that it holds exactly what was approved, then tick
every box in this task.

```bash
git add .agents/plans/16-09-2026-tailored-resume.md
git commit -m "Record the approved tailored-CV prompt"
```

**Do not start Task 2 until every box above is ticked.**

---

### Task 2: The `resume` column

Adds one nullable text column and exposes it on the two schemas that are allowed to carry it. No
model call and no route yet, so this task is reviewable on its own: it proves the column is written
by `POST /applications` and cannot be reached by `PATCH`.

**Files:**

- Modify: `backend/app/models.py` - `Application`, after `match_weaknesses`
- Modify: `backend/app/schemas.py` - `ApplicationCreate`, `ApplicationDetail`
- Create: `backend/alembic/versions/<generated>.py`
- Test: `backend/tests/test_applications.py` - after `test_patch_cannot_touch_the_ai_fields`
- Regenerate: `backend/openapi.json`

**Interfaces:**

- Consumes: nothing from Task 1 except its approval.
- Produces: `Application.resume: Mapped[str | None]`; `ApplicationCreate.resume: str | None = None`;
  `ApplicationDetail.resume: str | None`. Tasks 5 and 7 read and write them.

**Adds 3 tests.**

- [ ] **Step 1: Write the three failing tests**

In `backend/tests/test_applications.py`, after `test_patch_cannot_touch_the_ai_fields`:

```python
async def test_create_stores_the_resume_it_was_given(client):
    application_id = await create(client, resume="NICOLAS\n\nSUMMARY\nShips product.")

    detail = (await client.get(f"/applications/{application_id}")).json()
    assert detail["resume"] == "NICOLAS\n\nSUMMARY\nShips product."


async def test_an_application_created_by_hand_has_no_resume(client):
    application_id = await create(client)

    assert (await client.get(f"/applications/{application_id}")).json()["resume"] is None


async def test_patch_cannot_touch_the_resume(client):
    """The CV is AI-owned, exactly like the match: ApplicationPatch has no field for it, so a hand
    edit that sends one is ignored rather than honoured."""
    application_id = await create(client, resume="Original CV.")

    response = await client.patch(
        f"/applications/{application_id}", json={"title": "Renamed", "resume": "Talked up."}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Renamed"
    assert body["resume"] == "Original CV."
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd backend && uv run pytest tests/test_applications.py -k resume -v`
Expected: 3 failed, with `KeyError: 'resume'` - `ApplicationDetail` has no such field, so the
response body has no such key.

- [ ] **Step 3: Add the column**

In `backend/app/models.py`, inside `Application`, immediately after `match_weaknesses`:

```python
    # The tailored CV. Written by AI mode and by the re-write route, never by a hand edit, for the
    # same reason the match fields are not on ApplicationPatch.
    resume: Mapped[str | None] = mapped_column(Text)
```

- [ ] **Step 4: Add the two schema fields**

In `backend/app/schemas.py`, in `ApplicationCreate`, after `match_weaknesses`:

```python
    resume: str | None = None
```

and in `ApplicationDetail`, after `match_weaknesses`:

```python
    resume: str | None
```

`ApplicationPatch` gets nothing. `ApplicationListItem` gets nothing either - the list row shows a
title, a company, two ratings and a status, and a CV is not summarisable into a column.

- [ ] **Step 5: Generate the migration**

Run, from `backend/`:

```bash
uv run alembic revision --autogenerate -m "Add the tailored resume"
```

Open the generated file and check it says exactly this and nothing else. Autogenerate compares
against whatever `DATABASE_URL` points at, so a dev branch that has drifted produces extra
operations - delete them.

```python
def upgrade() -> None:
    op.add_column("applications", sa.Column("resume", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("applications", "resume")
```

- [ ] **Step 6: Apply it to both branches**

The dev branch is what `.env` points at. The test branch is a second database and `pytest` never
migrates it, so it has to be migrated by hand or the next step fails on a missing column.

```bash
cd backend
uv run alembic upgrade head
DATABASE_URL="$(grep '^TEST_DATABASE_URL=' .env | cut -d= -f2-)" uv run alembic upgrade head
```

In PowerShell the second line is two statements:

```powershell
$env:DATABASE_URL = (Select-String '^TEST_DATABASE_URL=' .env).Line -replace '^TEST_DATABASE_URL=', ''
uv run alembic upgrade head
```

Unset `DATABASE_URL` afterwards, or the rest of the session runs against the test branch.

- [ ] **Step 7: Run the tests**

Run: `cd backend && uv run pytest`
Expected: PASS, baseline + 3.

- [ ] **Step 8: Regenerate the committed OpenAPI schema**

Run: `cd backend && uv run python -m scripts.export_openapi`
CI fails the build if `openapi.json` differs from what the models produce, so this is not optional.

- [ ] **Step 9: Lint and commit**

```bash
cd backend && uv run ruff check . && uv run ruff format --check .
git add backend/app/models.py backend/app/schemas.py backend/alembic/versions backend/openapi.json backend/tests/test_applications.py
git commit -m "Add a resume column to applications"
```

---

### Task 3: The model call

The prompt approved in Task 1, the call that sends it, and the stub that stands in for it. No route
yet: this task is finished when `stub_tailor` behaves and `ruff` is clean.

**Files:**

- Modify: `backend/app/ai.py` - appended at the end of the file
- Test: `backend/tests/test_ai.py`

**Interfaces:**

- Consumes: `RESUME_SYSTEM` and `RESUME_TASK` exactly as approved in Task 1, Step 3 of this file.
- Produces: `tailor(ad_text: str, profile: str) -> str`; `stub_tailor(ad_text: str, profile: str)
  -> str`; `Tailor = Callable[[str, str], str]`; `get_tailor() -> Tailor`;
  `TailorDep = Annotated[Tailor, Depends(get_tailor)]`. Tasks 4 and 5 depend on `TailorDep`, and the
  Task 4 fixture overrides `get_tailor`.

**Adds 2 tests.**

- [ ] **Step 1: Write the two failing tests**

In `backend/tests/test_ai.py`, extend the import to `from app.ai import half_step, stub_enrich,
stub_tailor` and append:

```python
def test_the_stub_tailor_returns_a_document_carrying_the_advert():
    resume = stub_tailor("Full Stack Engineer - AI Finance Agent. Remote, Sweden.", "Nicolas.")

    assert resume.startswith("NICOLAS STUB")
    assert resume.endswith("TAILORED FOR\nFull Stack Engineer - AI Finance Agent. Remote, Sweden.")


def test_the_stub_tailor_keeps_only_the_opening_of_a_long_advert():
    """A whole advert echoed back would make the end-to-end assertions match half the page."""
    resume = stub_tailor("x" * 200, "Nicolas.")

    assert resume.endswith("TAILORED FOR\n" + "x" * 60)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd backend && uv run pytest tests/test_ai.py -v`
Expected: collection error - `ImportError: cannot import name 'stub_tailor' from 'app.ai'`.

- [ ] **Step 3: Paste the approved prompt into `app/ai.py`**

Append to the end of `backend/app/ai.py` the `RESUME_SYSTEM` and `RESUME_TASK` assignments from
Task 1, Step 3 of this file, **verbatim**. Do not reword them, do not re-wrap them, and do not
"improve" them while pasting: that text is what was signed off.

- [ ] **Step 4: Write the call, the stub and the dependency**

Append this immediately below the two constants:

```python
def tailor(ad_text: str, profile: str) -> str:
    """The resume itself, as plain text. Like enrich, the answer is the document, so there is no
    object to parse."""
    response = client.responses.create(
        model=settings.openai_model,
        input=[
            {"role": "system", "content": RESUME_SYSTEM},
            {"role": "user", "content": RESUME_TASK.format(profile=profile, ad_text=ad_text)},
        ],
    )
    return response.output_text.strip()


STUB_RESUME = """NICOLAS STUB
Stubbed Product Engineer

SUMMARY
A fixed resume, so the end-to-end suite never calls OpenAI.

CORE SKILLS
Stubbed: one, two."""


def stub_tailor(ad_text: str, profile: str) -> str:
    """Echoes the advert's opening, so the end-to-end suite proves the paste reached the model
    rather than only that some text came back."""
    return f"{STUB_RESUME}\n\nTAILORED FOR\n{ad_text[:60]}"


Tailor = Callable[[str, str], str]


def get_tailor() -> Tailor:
    if settings.ai_stub:
        return stub_tailor
    return tailor


TailorDep = Annotated[Tailor, Depends(get_tailor)]
```

Nothing new has to be imported: `Callable`, `Annotated`, `Depends`, `client` and `settings` are all
already at the top of the file.

- [ ] **Step 5: Run the tests**

Run: `cd backend && uv run pytest tests/test_ai.py -v`
Expected: PASS, 11 tests in this file (9 before, 2 added).

- [ ] **Step 6: Lint and commit**

```bash
cd backend && uv run ruff check . && uv run ruff format --check .
git add backend/app/ai.py backend/tests/test_ai.py
git commit -m "Write a CV from a job advert and the candidate profile"
```

---

### Task 4: `POST /job-ads/resume`

The route the create form calls, where there is no application to write to yet. It stores nothing.
This task also extracts `require_profile`, because three callers now need "the profile, or a 409".

**Files:**

- Modify: `backend/app/schemas.py` - `ResumeDraft`, after `ProfileDraft`
- Modify: `backend/app/routers/profile.py` - `require_profile`
- Modify: `backend/app/routers/applications.py` - `score_match` onto `require_profile`
- Modify: `backend/app/routers/job_ads.py` - the route
- Modify: `backend/tests/conftest.py` - the `stub_tailor` fixture
- Create: `backend/tests/test_resume.py`
- Regenerate: `backend/openapi.json`

**Interfaces:**

- Consumes: `TailorDep` and `get_tailor` from Task 3; `load_content` from `app/routers/profile.py`.
- Produces: `ResumeDraft(content: str)`; `require_profile(session: Session) -> str`; the route
  `POST /job-ads/resume`; the `stub_tailor` pytest fixture, which Task 5 also uses.

**Adds 5 tests.**

- [ ] **Step 1: Add the recorder fixture**

In `backend/tests/conftest.py`, extend the AI import to `from app.ai import get_analyser,
get_enricher, get_tailor` and append after `stub_enricher`:

```python
@pytest.fixture
def stub_tailor():
    """Swaps the OpenAI call for a recorder, so tests can assert what the model was handed."""

    calls: list[tuple[str, str]] = []

    def _install(answer: str = "NICOLAS\n\nSUMMARY\nShips product.") -> list[tuple[str, str]]:
        def tailor(ad_text: str, profile: str) -> str:
            calls.append((ad_text, profile))
            return answer

        app.dependency_overrides[get_tailor] = lambda: tailor
        return calls

    yield _install
    app.dependency_overrides.pop(get_tailor, None)
```

This fixture shares its name with `app.ai.stub_tailor`, which is deliberate: the other two fixtures
are named after the dependency they override. They never collide, because a fixture is only bound
where a test declares a parameter of that name, and `test_ai.py` imports the function instead.

- [ ] **Step 2: Write the five failing tests**

Create `backend/tests/test_resume.py`:

```python
from tests.test_applications import create

ADVERT = "Full Stack Software Engineer - AI Finance Agent. Remote, Sweden."
PROFILE = "Nicolas, full stack engineer. FastAPI, Angular, Neon."


async def test_a_draft_cv_comes_back_as_text(client, stub_tailor):
    stub_tailor("NICOLAS\n\nSUMMARY\nShips product.")
    await client.put("/profile", json={"content": PROFILE})

    response = await client.post("/job-ads/resume", json={"text": ADVERT})

    assert response.status_code == 200
    assert response.json() == {"content": "NICOLAS\n\nSUMMARY\nShips product."}


async def test_a_draft_cv_hands_the_advert_and_the_stored_profile_to_the_model(client, stub_tailor):
    calls = stub_tailor()
    await client.put("/profile", json={"content": PROFILE})

    await client.post("/job-ads/resume", json={"text": ADVERT})

    assert calls == [(ADVERT, PROFILE)]


async def test_a_draft_cv_stores_nothing(client, stub_tailor):
    """The draft belongs to the create form until the user submits it, exactly like an enrich."""
    stub_tailor()
    await client.put("/profile", json={"content": PROFILE})

    await client.post("/job-ads/resume", json={"text": ADVERT})

    assert (await client.get("/applications?include_closed=true")).json() == []


async def test_a_draft_cv_without_a_profile_is_409(client, stub_tailor):
    calls = stub_tailor()

    response = await client.post("/job-ads/resume", json={"text": ADVERT})

    assert response.status_code == 409
    # Refused before the model is reached: an empty profile has nothing to assemble a CV from.
    assert calls == []


async def test_a_draft_cv_rejects_an_empty_advert(client, stub_tailor):
    stub_tailor()
    await client.put("/profile", json={"content": PROFILE})

    assert (await client.post("/job-ads/resume", json={"text": ""})).status_code == 422
```

- [ ] **Step 3: Run them and watch them fail**

Run: `cd backend && uv run pytest tests/test_resume.py -v`
Expected: 5 failed with `404`, because the route does not exist (the `422` case fails too - it gets
a 404 rather than a 422).

- [ ] **Step 4: Add the response model**

In `backend/app/schemas.py`, after `ProfileDraft`:

```python
class ResumeDraft(BaseModel):
    """A tailored CV for an advert that has no application yet. Stored nowhere - the create form
    carries it until the application is written."""

    content: str
```

- [ ] **Step 5: Extract `require_profile`**

In `backend/app/routers/profile.py`, extend the FastAPI import to
`from fastapi import APIRouter, Depends, HTTPException, status` and add below `load_content`:

```python
def require_profile(session: Session) -> str:
    """A CV is assembled out of the profile, so an empty one has nothing to assemble from. Scoring
    refuses for a different reason - writing nulls would erase a score already earned."""
    profile = load_content(session)
    if not profile.strip():
        raise HTTPException(status.HTTP_409_CONFLICT, "The candidate profile is empty")
    return profile
```

Then in `backend/app/routers/applications.py`, change the import to
`from app.routers.profile import require_profile` and replace these four lines in `score_match`:

```python
    profile = load_content(session)
    # Scoring with no profile returns nulls, and writing those would erase a good score.
    if not profile.strip():
        raise HTTPException(status.HTTP_409_CONFLICT, "The candidate profile is empty")
```

with:

```python
    # Scoring with no profile returns nulls, and writing those would erase a good score.
    profile = require_profile(session)
```

The message must stay byte-identical, or `test_scoring_without_a_profile_is_409` starts asserting
against a message that changed for no reason. `load_content` drops out of `applications.py`
entirely - `score_match` was its only caller there - so leaving it in the import is an unused import
and `ruff` fails the task. It stays imported in `job_ads.py`, where `analyse_job_ad` still uses it,
because that route deliberately does not refuse an empty profile.

- [ ] **Step 6: Add the route**

In `backend/app/routers/job_ads.py`, extend the imports to
`from app.ai import AnalyserDep, TailorDep`,
`from app.routers.profile import load_content, require_profile` and
`from app.schemas import JobAdText, JobAnalysis, ResumeDraft`, then append:

```python
@router.post("/resume", response_model=ResumeDraft)
def write_draft_resume(payload: JobAdText, session: SessionDep, tailor: TailorDep):
    """Writes a CV for an advert with no application yet. Stores nothing: the create form carries
    the draft in a hidden field and it is written with the application, or not at all."""
    return ResumeDraft(content=tailor(payload.text, require_profile(session)))
```

- [ ] **Step 7: Run the tests**

Run: `cd backend && uv run pytest tests/test_resume.py -v`
Expected: PASS, 5 tests.

Then run the whole suite, because Step 5 touched `score_match`:

Run: `cd backend && uv run pytest`
Expected: PASS, baseline + 3 + 2 + 5.

- [ ] **Step 8: Regenerate the schema, lint, commit**

```bash
cd backend && uv run python -m scripts.export_openapi
cd backend && uv run ruff check . && uv run ruff format --check .
git add backend/app/schemas.py backend/app/routers backend/openapi.json backend/tests/conftest.py backend/tests/test_resume.py
git commit -m "Write a draft CV for an advert that has no application yet"
```

---

### Task 5: `POST /applications/{id}/resume`

The route the detail screen calls, which re-writes the stored advert into the `resume` column
against whatever the profile says today. It is the CV's equivalent of `/match`, and it refuses on
the same two conditions.

**Files:**

- Modify: `backend/app/routers/applications.py` - after `score_match`
- Test: `backend/tests/test_resume.py`
- Modify: `backend/tests/test_applications.py` - the route inventory and the auth parametrize list
- Regenerate: `backend/openapi.json`, `frontend/src/lib/api-types.ts`

**Interfaces:**

- Consumes: `TailorDep` (Task 3), `require_profile` (Task 4), `Application.resume` (Task 2),
  `_load` from `app/routers/applications.py`.
- Produces: the route `POST /applications/{application_id}/resume`, returning `ApplicationDetail`.
  Task 7 calls it; Task 6 regenerates the types it produces.

**Adds 6 tests:** four written below, plus two more collected from
`test_every_application_route_requires_the_api_key`, which is parametrized - each row added to it is
a test.

- [ ] **Step 1: Write the four failing tests**

Append to `backend/tests/test_resume.py`, and add `import uuid` at the top of that file:

```python
async def test_writing_stores_the_cv_on_the_application(client, stub_tailor):
    calls = stub_tailor("NICOLAS\n\nSUMMARY\nRewritten for this advert.")
    await client.put("/profile", json={"content": PROFILE})
    application_id = await create(client, job_ad=ADVERT, resume="An older CV.")

    response = await client.post(f"/applications/{application_id}/resume")

    assert response.status_code == 200
    # Replaced wholesale, never appended to: there is one current CV, not a history of them.
    assert response.json()["resume"] == "NICOLAS\n\nSUMMARY\nRewritten for this advert."
    assert calls == [(ADVERT, PROFILE)]


async def test_writing_without_a_stored_advert_is_409(client, stub_tailor):
    stub_tailor()
    await client.put("/profile", json={"content": PROFILE})
    application_id = await create(client)

    response = await client.post(f"/applications/{application_id}/resume")

    assert response.status_code == 409


async def test_writing_without_a_profile_is_409_and_keeps_the_old_cv(client, stub_tailor):
    stub_tailor()
    application_id = await create(client, job_ad=ADVERT, resume="Kept.")

    response = await client.post(f"/applications/{application_id}/resume")

    assert response.status_code == 409
    detail = (await client.get(f"/applications/{application_id}")).json()
    assert detail["resume"] == "Kept."


async def test_writing_for_an_unknown_application_is_404(client, stub_tailor):
    stub_tailor()

    response = await client.post(f"/applications/{uuid.uuid4()}/resume")

    assert response.status_code == 404
```

- [ ] **Step 2: Add the two routes to the inventory and the auth list**

In `backend/tests/test_applications.py`, add to the set in
`test_openapi_exposes_exactly_the_expected_routes`:

```python
        ("/applications/{application_id}/resume", "POST"),
        ("/job-ads/resume", "POST"),
```

and to the parametrize list on `test_every_application_route_requires_the_api_key`:

```python
        ("POST", "/applications/{id}/resume"),
        ("POST", "/job-ads/resume"),
```

The auth test sends a body that `/job-ads/resume` would reject as a 422. It never gets that far: the
API key is checked by a router-level dependency, before the body is validated. `/job-ads/analyse` is
already in that list for the same reason.

- [ ] **Step 3: Run them and watch them fail**

Run: `cd backend && uv run pytest tests/test_resume.py tests/test_applications.py -v`
Expected: the four new tests fail with `404`, the route inventory fails on a set that is missing
`/applications/{application_id}/resume`, and the two new auth rows fail with `404` instead of `401`.

- [ ] **Step 4: Add the route**

In `backend/app/routers/applications.py`, extend the AI import to
`from app.ai import AnalyserDep, TailorDep` and add immediately after `score_match`:

```python
@router.post("/{application_id}/resume", response_model=ApplicationDetail)
def write_resume(application_id: uuid.UUID, session: SessionDep, tailor: TailorDep):
    """Re-writes the stored advert into a CV against the current profile, which is the other half
    of why the advert is stored at all."""
    application = _load(session, application_id)
    if not application.job_ad:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This application has no stored job advert to write from"
        )
    application.resume = tailor(application.job_ad, require_profile(session))
    session.flush()
    return application
```

Order matters in the two refusals: the missing advert is checked first, so an application with
neither an advert nor a profile reports the thing the user can actually see on the screen.

- [ ] **Step 5: Run the whole suite**

Run: `cd backend && uv run pytest`
Expected: PASS, baseline + 16 (3 + 2 + 5 + 6).

- [ ] **Step 6: Regenerate both generated files**

```bash
cd backend && uv run python -m scripts.export_openapi
cd frontend && npm run gen:types
```

`api-types.ts` has been stale since Task 2 and nothing on the frontend referenced the new fields, so
this is the first point where it matters. Check `git diff frontend/src/lib/api-types.ts` mentions
`resume` and `ResumeDraft`.

- [ ] **Step 7: Lint and commit**

```bash
cd backend && uv run ruff check . && uv run ruff format --check .
git add backend/app/routers/applications.py backend/openapi.json backend/tests/test_resume.py backend/tests/test_applications.py frontend/src/lib/api-types.ts
git commit -m "Re-write a stored advert into a CV from the detail screen"
```

---

### Task 6: The create form

The second button, the panel that shows what came back, and the hidden field that carries it into
the create. After this task a CV can be written and saved, but not re-written.

**Files:**

- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/app/applications/actions.ts`
- Create: `frontend/src/components/resume-panel.tsx`
- Modify: `frontend/src/components/job-ad-analyser.tsx`
- Modify: `frontend/src/components/application-form.tsx`

**Interfaces:**

- Consumes: `POST /job-ads/resume` returning `{content: string}` (Task 4);
  `ApplicationCreate.resume` (Task 2); the regenerated `api-types.ts` (Task 5).
- Produces: `tailorResume(text: string): Promise<ResumeDraft>`;
  `writeResume(id: string): Promise<ApplicationDetail>`;
  `tailorResumeAction(text: string): Promise<ResumeState>` where
  `ResumeState = { resume?: string; error?: string }`;
  `writeResumeAction(id: string): Promise<{ error?: string }>`;
  `<ResumePanel resume={string} />`. Task 7 uses `writeResumeAction` and `ResumePanel`.

**Adds 0 Vitest tests.** Nothing here is logic: a string arrives, is painted into a `<pre>`, and is
copied. `AGENTS.md` is explicit that render-only components are not given tests to reach a coverage
number. Task 8 covers this task end to end instead.

- [ ] **Step 1: Add the two API calls**

In `frontend/src/lib/api.ts`, add the type beside the other exported types:

```ts
export type ResumeDraft = components["schemas"]["ResumeDraft"];
```

and the two functions at the end of the file, after `scoreMatch`:

```ts
export function tailorResume(text: string) {
  return call<ResumeDraft>("/job-ads/resume", { method: "POST", body: JSON.stringify({ text }) });
}

export function writeResume(id: string) {
  return call<ApplicationDetail>(`/applications/${id}/resume`, { method: "POST" });
}
```

- [ ] **Step 2: Add the two Server Actions**

In `frontend/src/app/applications/actions.ts`, extend the import from `@/lib/api` with
`tailorResume` and `writeResume`, then add `resume` to `readAiFields`:

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
    resume: optional(formData, "resume"),
  };
}
```

and append the two actions at the end of the file:

```ts
export type ResumeState = { resume?: string; error?: string };

/** Writes a CV for an advert that has no application yet. It stores nothing, so unlike every other
 *  action here it must not revalidate. */
export async function tailorResumeAction(text: string): Promise<ResumeState> {
  if (!text.trim()) return { error: "Paste the job advert first" };
  try {
    return { resume: (await tailorResume(text)).content };
  } catch (error) {
    console.error(error);
    if (error instanceof ApiError && error.status === 409) {
      return { error: "Fill in your profile first, on the Profile screen." };
    }
    return { error: "The CV could not be written. Try again." };
  }
}

export async function writeResumeAction(id: string): Promise<{ error?: string }> {
  try {
    await writeResume(id);
  } catch (error) {
    console.error(error);
    if (error instanceof ApiError && error.status === 409) {
      return { error: "Fill in your profile first, on the Profile screen." };
    }
    return { error: "The CV could not be written. Try again." };
  }
  revalidatePath("/", "layout");
  return {};
}
```

The backend's other 409 on that route - no stored advert - cannot reach this message, because the
button is only rendered when there is one. `scoreMatchAction` makes the same trade.

- [ ] **Step 3: Create the panel**

Create `frontend/src/components/resume-panel.tsx`:

```tsx
"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/** The tailored CV, rendered the same way in both places it appears: on the detail screen, and on
 *  the create form as a preview of a CV that has not been saved yet. A <pre>, because the model
 *  returns a laid-out plain-text document and its blank lines are the layout. */
export function ResumePanel({ resume }: { resume: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(resume);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section aria-label="Tailored CV" className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Tailored CV</p>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="max-h-96 overflow-auto font-sans text-sm whitespace-pre-wrap">{resume}</pre>
    </section>
  );
}
```

`font-sans` on the `<pre>`: the document wants preserved line breaks, not a monospace typeface. The
label is spelled out beside the icon, because an icon-only button says nothing to a screen reader
and colour is never the only signal here either.

- [ ] **Step 4: Add the second button to the analyser**

Replace `frontend/src/components/job-ad-analyser.tsx` entirely:

```tsx
"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { analyseJobAdAction, tailorResumeAction } from "@/app/applications/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { JobAnalysis } from "@/lib/api";

export function JobAdAnalyser({
  onAnalysed,
  onTailored,
}: {
  onAnalysed: (analysis: JobAnalysis, adText: string) => void;
  onTailored: (resume: string) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unscored, setUnscored] = useState(false);
  const [filling, startFilling] = useTransition();
  const [writing, startWriting] = useTransition();
  // One advert box feeding two calls. Neither runs while the other is in flight, so the text a
  // result belongs to is always the text that is still in the box.
  const busy = filling || writing;

  function analyse() {
    setError(null);
    startFilling(async () => {
      const result = await analyseJobAdAction(text);
      if (result.error || !result.analysis) {
        setError(result.error ?? "The advert could not be read. Try again.");
        return;
      }
      setUnscored(result.analysis.match_rating === null);
      onAnalysed(result.analysis, text);
    });
  }

  function tailor() {
    setError(null);
    startWriting(async () => {
      const result = await tailorResumeAction(text);
      if (result.error || !result.resume) {
        setError(result.error ?? "The CV could not be written. Try again.");
        return;
      }
      onTailored(result.resume);
    });
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <Switch id="ai-mode" checked={enabled} onCheckedChange={setEnabled} disabled={busy} />
        <Label htmlFor="ai-mode" className="text-sm font-normal">
          AI mode
        </Label>
        <span className="text-sm text-muted-foreground">
          Paste the advert to fill this in and to write a CV for it
        </span>
      </div>

      {enabled && (
        <div className="space-y-3">
          <Textarea
            id="job-ad"
            aria-label="Job advert"
            rows={8}
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={busy}
            placeholder="Paste the whole job advert here"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={analyse} disabled={busy || text.trim() === ""}>
              {filling && <Loader2 className="animate-spin" aria-hidden />}
              {filling ? "Reading the advert..." : "Fill the form"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={tailor}
              disabled={busy || text.trim() === ""}
            >
              {writing && <Loader2 className="animate-spin" aria-hidden />}
              {writing ? "Writing your CV..." : "Write my CV"}
            </Button>
            {busy && (
              <p role="status" className="text-sm text-muted-foreground">
                {writing ? "This takes up to a minute." : "This takes a few seconds."}
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {unscored && !busy && (
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

- [ ] **Step 5: Hold the CV on the form and submit it**

In `frontend/src/components/application-form.tsx`, add the import:

```tsx
import { ResumePanel } from "@/components/resume-panel";
```

add the state beside `prefill`:

```tsx
  // Independent of prefill: the CV can be written without ever pressing "Fill the form", and it
  // survives a re-analysis, which remounts the form but not this component.
  const [resume, setResume] = useState<string | null>(null);
```

pass the callback:

```tsx
      {creating && <JobAdAnalyser onAnalysed={applyAnalysis} onTailored={setResume} />}
```

render the panel immediately after the `MatchPanel` block:

```tsx
      {resume && <ResumePanel resume={resume} />}
```

and add the hidden field immediately after the closing `)}` of the existing `{prefill && (...)}`
block, inside the `<form>`:

```tsx
        {resume && <input type="hidden" name="resume" value={resume} />}
```

It is a separate conditional, not part of the `prefill` block, because a CV can exist with no
analysis behind it.

- [ ] **Step 6: Check it compiles and the existing suites still pass**

```bash
cd frontend && npx next typegen && npx tsc --noEmit
cd frontend && npm run lint
cd frontend && npm test
```

Expected: no type errors, no lint errors, Vitest unchanged at the baseline count.

- [ ] **Step 7: Try it by hand**

Start both services (`cd backend && uv run fastapi dev app/main.py`, `cd frontend && npm run dev`),
write something into `/profile`, then open `/applications/new`, turn AI mode on, paste a real
advert, and press `Write my CV`. Read what comes back against the six points in Task 1 - this is the
first time the real prompt meets a real advert, and it is much cheaper to fix the wording now than
after Task 10 has written it into the spec. Press `Copy` and paste it somewhere to confirm the line
breaks survive.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/app/applications/actions.ts frontend/src/components/resume-panel.tsx frontend/src/components/job-ad-analyser.tsx frontend/src/components/application-form.tsx
git commit -m "Write a tailored CV from the create form"
```

---

### Task 7: The detail screen

Where a stored CV is read, copied, and written again when the profile has improved.

**Files:**

- Create: `frontend/src/components/write-resume-button.tsx`
- Modify: `frontend/src/app/applications/[id]/page.tsx`

**Interfaces:**

- Consumes: `writeResumeAction` and `ResumePanel` (Task 6); `ApplicationDetail.resume` (Task 2);
  `POST /applications/{id}/resume` (Task 5).
- Produces: `<WriteResumeButton id={string} written={boolean} />`.

**Adds 0 Vitest tests**, for the same reason as Task 6. Task 8 covers it end to end.

- [ ] **Step 1: Create the button**

Create `frontend/src/components/write-resume-button.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";

import { writeResumeAction } from "@/app/applications/actions";
import { Button } from "@/components/ui/button";

export function WriteResumeButton({ id, written }: { id: string; written: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function write() {
    setError(null);
    startTransition(async () => {
      const result = await writeResumeAction(id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={write} disabled={pending}>
        {pending ? "Writing..." : written ? "Write it again" : "Write my CV"}
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

- [ ] **Step 2: Render the panel and the button on the detail page**

In `frontend/src/app/applications/[id]/page.tsx`, add the two imports beside the existing ones:

```tsx
import { ResumePanel } from "@/components/resume-panel";
import { WriteResumeButton } from "@/components/write-resume-button";
```

Add the panel immediately after the `{application.job_ad && (<details>...</details>)}` block, so the
CV sits directly under the advert it was written from:

```tsx
        {application.resume && <ResumePanel resume={application.resume} />}
```

and add the button to the action row, beside `ScoreMatchButton`:

```tsx
          {application.job_ad && (
            <>
              <ScoreMatchButton id={application.id} scored={application.match_rating != null} />
              <WriteResumeButton id={application.id} written={application.resume != null} />
            </>
          )}
```

Both are gated on `job_ad` for the same reason: neither has anything to work from without the stored
advert, and a button that can only fail is worse than no button.

- [ ] **Step 3: Check it compiles**

```bash
cd frontend && npx next typegen && npx tsc --noEmit
cd frontend && npm run lint
```

Expected: clean.

- [ ] **Step 4: Try it by hand**

With both services running, open an application created through AI mode, press `Write my CV`, and
confirm the panel appears and the button relabels to `Write it again`. Then blank `/profile`, come
back, and press it: the refusal must appear and the CV already on the page must still be there.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/write-resume-button.tsx "frontend/src/app/applications/[id]/page.tsx"
git commit -m "Show and re-write the tailored CV on the detail screen"
```

---

### Task 8: End to end

Three tests through the stub, covering the two screens and the one refusal.

**Files:**

- Modify: `frontend/e2e/ai-mode.spec.ts`

**Interfaces:**

- Consumes: `stub_tailor` behind `AI_STUB` (Task 3); everything Tasks 6 and 7 rendered.
- Produces: nothing other tasks depend on.

**Adds 3 Playwright tests.**

- [ ] **Step 1: Write the three tests**

Append to `frontend/e2e/ai-mode.spec.ts`:

```ts
test("AI mode writes a tailored CV for the pasted advert", async ({ page }) => {
  await saveProfile(page, "Nicolas, full stack engineer.");
  await page.goto("/applications/new");

  await page.getByLabel("AI mode").click();
  await expect(page.getByRole("region", { name: "Tailored CV" })).toBeHidden();
  await page.getByLabel("Job advert").fill(ADVERT);
  await page.getByRole("button", { name: "Write my CV" }).click();

  const preview = page.getByRole("region", { name: "Tailored CV" });
  await expect(preview.getByText("NICOLAS STUB")).toBeVisible();
  // Proves the pasted advert reached the backend, not just that some text came back.
  await expect(preview.getByText(ADVERT.slice(0, 60))).toBeVisible();

  // The rest of the form is still hand-fillable: the CV button does not fill anything in.
  await page.getByLabel("Job title").fill("Tailored CV candidate");
  await page.getByLabel("Company").fill("ACME");
  await page.getByLabel("Sector").fill("Tech");
  await page.getByLabel("Location").fill("Paris");
  await page.getByLabel("Date").fill("2026-09-16");
  await page.getByRole("button", { name: "Create application" }).click();

  await expect(page.getByRole("heading", { name: "Tailored CV candidate" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Tailored CV" }).getByText("NICOLAS STUB"),
  ).toBeVisible();
});

test("a stored advert can be written into a CV from the detail screen", async ({ page }) => {
  await saveProfile(page, "Nicolas, full stack engineer.");
  const detail = await createThroughAiMode(page);

  await page.goto(detail);
  // createThroughAiMode never presses the CV button, so this application starts without one.
  await expect(page.getByRole("region", { name: "Tailored CV" })).toBeHidden();
  await page.getByRole("button", { name: "Write my CV" }).click();

  await expect(
    page.getByRole("region", { name: "Tailored CV" }).getByText("NICOLAS STUB"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Write it again" })).toBeVisible();
});

test("writing a CV is refused while the profile is empty", async ({ page }) => {
  await saveProfile(page, "Nicolas, full stack engineer.");
  const detail = await createThroughAiMode(page);

  await saveProfile(page, "");
  await page.goto(detail);
  await page.getByRole("button", { name: "Write my CV" }).click();

  // Not getByRole("alert"): Next renders its own empty route announcer with that role.
  await expect(page.getByText("Fill in your profile first")).toBeVisible();
  await expect(page.getByRole("region", { name: "Tailored CV" })).toBeHidden();
});
```

The first test fills the form by hand rather than calling `Fill the form`, because that is the case
worth proving: the two buttons are independent, and a CV written without an analysis still reaches
the database. `Write my CV` and `Write it again` are distinct accessible names, so the second test's
final assertion cannot pass against the pre-click state.

- [ ] **Step 2: Run the end-to-end suite**

Run: `cd frontend && npm run test:e2e`
Expected: PASS, baseline + 3. Do not start either service by hand first - Playwright sets
`reuseExistingServer: false` on the backend and a hand-started one collides with it.

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/ai-mode.spec.ts
git commit -m "Cover the tailored CV end to end"
```

---

### Task 9: Function duration

A four-field extraction returns in seconds. A one-page document written against a full career
profile does not, and the difference only shows up in production, where the local suites cannot see
it. Set it rather than discover it.

**Files:**

- Modify: `backend/vercel.json`
- Modify: `frontend/src/app/applications/new/page.tsx`
- Modify: `frontend/src/app/applications/[id]/page.tsx`

**Interfaces:** none. Nothing imports anything here.

**Adds 0 tests.** Neither local suite runs on Vercel, so this is verified on a preview deployment.

- [ ] **Step 1: Confirm the limit your Vercel plan allows**

Read the current ceiling before picking a number - it differs by plan and it has moved. The
`vercel:vercel-functions` skill covers it, and `vercel.json` is schema-validated at build time, so a
value the plan will not allow fails the build with a message naming the limit rather than shipping
something that times out.

- [ ] **Step 2: Raise it on the backend**

`backend/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "fastapi",
  "functions": {
    "app/main.py": {
      "maxDuration": 300
    }
  }
}
```

If the build reports that the pattern matched no function, the entrypoint is resolved from
`[tool.vercel] entrypoint = "app.main:app"` in `pyproject.toml`; check the build log for the path
Vercel actually bundled and use that as the key.

- [ ] **Step 3: Raise it on the two Next routes that invoke the actions**

A Server Action runs inside the function of the route that invoked it, so the export goes on the
pages, not on `actions.ts`. Add at the top of `frontend/src/app/applications/new/page.tsx`, below
the imports:

```tsx
// A CV is a long generation. The Server Action runs inside this route's function, so the ceiling
// has to be raised here and not where the action is defined.
export const maxDuration = 300;
```

and the same two lines in `frontend/src/app/applications/[id]/page.tsx`, which hosts
`writeResumeAction` and `scoreMatchAction`.

- [ ] **Step 4: Verify on a preview**

Push the branch. The pipeline deploys nothing off `main`, so deploy the two previews by hand and
write a CV through the preview frontend against a real advert:

```bash
vercel deploy --project job-application-assistant-api
vercel deploy --project job-application-assistant
```

Expected: the CV comes back rather than a 504. If it still times out, the ceiling that bit is the
one on whichever service logged the timeout - read the log before changing both.

- [ ] **Step 5: Commit**

```bash
git add backend/vercel.json "frontend/src/app/applications/new/page.tsx" "frontend/src/app/applications/[id]/page.tsx"
git commit -m "Give the CV call room to finish"
```

---

### Task 10: The spec

`AGENTS.md` is the specification, and every passage below is now wrong. Fix them in one commit so
the diff reads as one decision.

**Files:**

- Modify: `AGENTS.md`
- Modify: `README.md`

**Interfaces:** none.

**Adds 0 tests.**

- [ ] **Step 1: MVP scope**

In the bullet list under `### MVP scope`, after the AI match bullet, add:

```markdown
- A tailored CV for the advert, written from it and the profile, as plain text (optional)
```

- [ ] **Step 2: Screens**

In screen 3, `Application detail`, add to the end of the first sentence's list, after "the pasted
advert in a collapsed block": ", the tailored CV with a copy button". Then add after
"Re-score the match from here too, when an advert was stored.":

```markdown
   Write the CV, or write it again, from here for the same reason.
```

In screen 4, `Create / edit application`, after the sentence ending "so the score can be read before
saving.", add:

```markdown
   A second button writes a tailored CV for the same advert and shows it in full, so it can be read
   and copied before saving. The two buttons are independent: either can be pressed without the
   other, and neither writes anything until the form is submitted.
```

- [ ] **Step 3: The API table**

Add two rows, each next to the route it mirrors - the application one after
`/applications/{id}/match`, and the job-ad one after `/job-ads/analyse`:

```markdown
| `POST`   | `/applications/{id}/resume`                     | Re-write a stored advert into a tailored CV      |
| `POST`   | `/job-ads/resume`                               | Write a tailored CV for one pasted advert        |
```

Then extend the paragraph that begins "`/profile/enrich` reads and writes no row" with a second
sentence:

```markdown
`/job-ads/resume` stores nothing either, for the same reason: the CV belongs to the create form until
the application is written, and a CV the user does not save leaves no trace.
```

- [ ] **Step 4: The schema block**

In the `applications` table, after `match_weaknesses`:

```
  resume       text        null        -- the tailored CV, written by AI only
```

- [ ] **Step 5: Testing focus**

Under **pytest**, after the existing enricher bullet, add:

```markdown
- What the CV writer is handed: the pasted advert and the stored profile, through the same recorder
  seam. That `/job-ads/resume` stores nothing, that both CV routes refuse an empty profile before
  the model is reached, and that a refusal leaves a CV already stored alone
- That `ApplicationPatch` cannot write `resume` either, and that re-writing replaces the stored CV
  wholesale
```

Under **Vitest**, add a sentence at the end:

```markdown
The tailored CV adds nothing here: a string arrives, is painted into a `<pre>`, and is copied.
```

Under **Playwright**, extend the list with:

```markdown
writing a CV on the create form and finding it on the saved application, writing one from the detail
screen, and the refusal when the profile is empty
```

- [ ] **Step 6: Deferred decisions**

Append these entries to the `## Deferred decisions` list:

```markdown
- **The CV is written from the profile alone.** There is no separate CV source document, so the
  profile is expected to hold the whole career bank - roles, dates, metrics, positioning - not a
  paragraph. That makes the profile large, and every match call ships it too. A second document
  read only by the CV writer is the fix if the profile becomes unwieldy to edit.
- **The CV is AI-owned and read-only**, exactly like the match. `ApplicationCreate` accepts
  `resume` and `ApplicationPatch` has no field for it, so a CV can only be replaced by writing it
  again, never corrected in place. The user copies it out and edits it wherever they keep their
  resume, which is what they were doing before this existed.
- **One page is a budget in the prompt, not a measurement.** The model cannot see a page, so the
  prompt states character ceilings per section and nothing in Python counts them. Same trade as the
  210-character match summary, and the same fix if it turns out to matter: clamp in `app/ai.py`.
- **The CV is written in the advert's language.** A French advert produces a French CV, which means
  the model translates the candidate's own material. Chosen because that is the document that
  actually gets sent; the cost is that wording the user approved in one language is re-rendered in
  another without review.
- **A CV written on the create form may store CRLF line endings.** It rides a hidden form field,
  the same path `comment` and `job_ad` take, while one written from the detail screen arrives as
  LF. Nothing diffs a CV, so neither is normalised.
- **Copy is the whole delivery.** No download, no `.docx`, no PDF. The CV is plain text because the
  next step is always a paste into a document that already has the formatting.
- **The CV call does not see the match.** It is handed the advert and the profile only, so a CV can
  be written for an application that was never scored, and re-writing one has no ordering
  constraint. Feeding it the strengths and weaknesses would steer it, at the cost of coupling two
  calls that are otherwise independent.
```

- [ ] **Step 7: README**

In the paragraph beginning "`OPENAI_API_KEY` is needed for AI mode", extend the sentence so it ends:

```markdown
..., folds plain-English updates into that profile, and writes a one-page CV tailored to an advert.
```

- [ ] **Step 8: Commit**

```bash
git add AGENTS.md README.md
git commit -m "Describe the tailored CV in the spec"
```

---

## When it is done

- [ ] `cd backend && uv run pytest` - baseline + 16
- [ ] `cd backend && uv run ruff check . && uv run ruff format --check .` - clean
- [ ] `cd frontend && npm test` - baseline, unchanged
- [ ] `cd frontend && npx next typegen && npx tsc --noEmit && npm run lint` - clean
- [ ] `cd frontend && npm run test:e2e` - baseline + 3
- [ ] `git diff main --stat` mentions no file outside the File Structure table
- [ ] One real advert, end to end, against a real profile: fields filled, match scored, CV written,
      copied, pasted, and read as something you would actually send
- [ ] Open a pull request. CI is the only route to production, and it runs all five of the above
      before it migrates anything
