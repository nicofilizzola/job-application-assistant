# `Tech test` Status - Implementation Plan

> **For agentic workers:** use the `executing-plans` skill to work through this plan task by task.
> Steps use checkbox (`- [ ]`) syntax for tracking. Tick them as you go.
>
> Tasks are ordered by the deploy contract: backend first, then generated types, then frontend, then
> docs. Do not reorder. Task 2 cannot run until Task 1 has re-exported `openapi.json`.

**Goal:** Add a seventh status, `Tech test`, to the status vocabulary. It is an open, repeatable
status sitting between `Interview` and `Offer`, rendered with a violet badge.

**Architecture:** There is no migration and no new column. `status_updates.status` is
`sa.Text()` with no `CHECK` constraint and no Postgres enum, so the set of legal values lives
entirely in the Pydantic `Status` StrEnum, which is the single source of truth. The frontend mirrors
that list once, in `frontend/src/lib/status.ts`; every dropdown maps over `STATUSES` and the Zod
schema derives its enum from the same array, so no form or validator needs touching. The only
hand-written frontend change is that one file. `frontend/src/lib/api-types.ts` is generated and must
be regenerated, never edited.

**Tech Stack:** FastAPI, Pydantic v2, pytest (backend); Next.js 16 App Router, Tailwind, Zod,
Vitest, Playwright, `openapi-typescript` (frontend).

**Spec:** `AGENTS.md`. Read it before starting. Its status table, schema comment, and colour table
all describe six statuses. Task 5 rewrites those passages. Until then the spec and this plan
disagree on purpose, and the plan wins.

## Decisions closed before planning

| Question                        | Answer                                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Exact stored string             | `Tech test`. Sentence case, one space. Shorter than `Technical test` so the badge stays near the width of the existing six |
| Position in the vocabulary      | Between `Interview` and `Offer`. Chronological for a take-home that follows a first conversation, and it keeps the dropdown reading as a funnel |
| Badge colour                    | Violet. Distinct from sky (`Contacted`), amber (`Interview`) and emerald (`Offer`), and not indigo, which is the app's single accent |
| Open or closed                  | Open. `CLOSED_STATUSES` stays `(Rejected, Withdrawn)`, so `Hide closed` keeps showing tech tests        |
| Repeatable                      | Yes, for free. Two `Tech test` updates on different dates are two tests, exactly as two `Interview` updates are two rounds. No field and no code supports this - the timeline already does |
| Backfill of existing rows       | None. No stored row can hold the new value, so nothing needs rewriting. Re-labelling a past `Interview` that was really a test is a by-hand edit in the UI, not a script |

## Decisions taken while planning

Technical, reversible, and flagged so they can be revisited rather than rediscovered.

| Decision                                                        | Reason                                                                 |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| No Alembic migration                                            | `status` is `Text` with no constraint. A migration would have nothing to alter. Confirmed against `backend/alembic/versions/3c5e515f4928_create_applications_and_status_updates.py:49` |
| Enum member name is `TECH_TEST`                                 | Python enum members cannot contain a space. The member name is internal; the value is the contract |
| The enum's declaration order is the wire order                  | `Status` is a `StrEnum` and FastAPI emits its members in declaration order, so inserting `TECH_TEST` before `OFFER` puts it in the right slot in `openapi.json`, in the generated union, and therefore in every dropdown |
| `STATUSES` in `status.ts` stays a hand-written array             | It could be derived from the generated union at runtime, but a union is a type and erases at compile time. The array is the runtime value the dropdowns and Zod need. The Vitest suite is what keeps it honest against the generated type |
| Violet gets the same light/dark treatment as sky and amber       | `border-violet-300 bg-violet-100 text-violet-900` with `dark:` counterparts. The existing test asserts every status carries a `dark:` variant |
| The existing `include_closed` test grows a seventh seeded row    | It seeds one application per status and asserts the open set exactly. A new open status that is missing from that test would let a future change silently classify `Tech test` as closed |
| No new Playwright spec                                          | `timeline.spec.ts` already drives the status dropdown by label through `addUpdate`. One existing test switches to `Tech test` to prove the value survives the whole browser-to-Neon round trip; a dedicated spec would add a database round trip to assert the same thing |

## Global Constraints

Copied from `AGENTS.md`. Every task's requirements implicitly include these.

- UI, labels, statuses, and code are all in **English**.
- **No emojis, ever.** Keep the README minimal.
- Keep it simple. No over-engineering, no unnecessary defensive programming, no extra features.
- Colour is never the only signal. Every status badge carries its text label.
- Full light and dark support. The app must be legible in both.
- `frontend/src/lib/api-types.ts` is **generated** and never hand-edited. `backend/openapi.json` is
  committed and regenerated with `uv run python -m scripts.export_openapi` from `backend/`.
- Frontend request and response types are downstream of Pydantic. Pydantic is the source of truth.
- Migrations run before the backend deploys, and the backend deploys before the frontend. A change
  must leave the currently deployed code working.

## File Structure

| File                                                | Responsibility                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| `backend/app/schemas.py:9-15`                       | Modify: `Status` StrEnum gains `TECH_TEST = "Tech test"` before `OFFER` |
| `backend/tests/test_applications.py:174-186`        | Modify: the `include_closed` test seeds and asserts a seventh status |
| `backend/openapi.json`                              | Regenerate. Committed, and the source of the frontend's types        |
| `frontend/src/lib/api-types.ts`                     | Regenerate. Never hand-edited                                        |
| `frontend/src/lib/status.ts`                        | Modify: `STATUSES` gains the value in position, `CLASSES` gains violet |
| `frontend/src/lib/status.test.ts`                   | Modify: the `isClosed` table and the colour assertions cover it      |
| `frontend/e2e/timeline.spec.ts:30-41`               | Modify: one existing test drives the new value end to end            |
| `AGENTS.md`                                         | Modify: status table, schema comment, colour table, deferred note    |

Untouched on purpose, because they read the vocabulary rather than restating it:
`backend/app/models.py` (column is `Text`), `backend/app/routers/applications.py` (filters on
`CLOSED_STATUSES`), `frontend/src/app/applications/actions.ts` (Zod derives from `STATUSES`),
`frontend/src/components/application-form.tsx`, `add-update-form.tsx`, `edit-update-dialog.tsx`
(all map over `STATUSES`), `frontend/src/components/status-badge.tsx` (renders whatever it is given).

---

## Task 1: The status value exists in the API

**Files:**
- Modify: `backend/app/schemas.py:9-15`
- Modify: `backend/tests/test_applications.py:174-186`
- Regenerate: `backend/openapi.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `Status.TECH_TEST`, whose value is the string `"Tech test"`. `Status` keeps its
  declaration order `Contacted, Applied, Interview, Tech test, Offer, Rejected, Withdrawn`, and
  `CLOSED_STATUSES` stays `(Status.REJECTED, Status.WITHDRAWN)`. Task 2 reads the regenerated
  `openapi.json`.

All commands in this task run from `backend/`.

- [x] **Step 1: Write the failing test**

Replace the body of `test_include_closed_selects_exactly_the_closed_statuses` in
`backend/tests/test_applications.py`. The seeded set grows a seventh row and both assertions grow
with it, so a change that mistakenly classifies `Tech test` as closed fails here.

```python
async def test_include_closed_selects_exactly_the_closed_statuses(client, seed):
    seed([on(1, "Applied")], title="Applied")
    seed([on(2, "Contacted")], title="Contacted")
    seed([on(3, "Interview")], title="Interview")
    seed([on(4, "Offer")], title="Offer")
    seed([on(5, "Rejected")], title="Rejected")
    seed([on(6, "Withdrawn")], title="Withdrawn")
    seed([on(7, "Tech test")], title="Tech test")

    open_only = (await client.get("/applications")).json()
    assert {row["title"] for row in open_only} == {
        "Applied",
        "Contacted",
        "Interview",
        "Offer",
        "Tech test",
    }

    everything = (await client.get("/applications", params={"include_closed": True})).json()
    assert len(everything) == 7
```

Then add a second test directly beneath it, asserting the value is accepted on the write path and
comes back as the derived current status. Put it in the same file.

`seed` returns the new application's id as a `str`, not an ORM object, and
`POST /{id}/status-updates` has `response_model=ApplicationDetail`, so the response body already
carries the re-derived `current_status`. No follow-up `GET` is needed.

```python
async def test_tech_test_is_an_accepted_status(client, seed):
    application_id = seed([on(1, "Applied")], title="Tech test round trip")

    response = await client.post(
        f"/applications/{application_id}/status-updates",
        json={"date": "2026-08-20", "status": "Tech test", "note": "take-home sent"},
    )

    assert response.status_code == 201, response.text
    assert response.json()["current_status"] == "Tech test"
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/test_applications.py -k "include_closed or tech_test" -v`

Expected: both FAIL, but for two different reasons, and it is worth knowing which is which so a
green run for the wrong reason is not mistaken for success.

- `test_tech_test_is_an_accepted_status` fails with `422` instead of `201`. It writes through the
  API, so `StatusUpdateCreate` rejects `"Tech test"` before anything is stored.
- `test_include_closed_selects_exactly_the_closed_statuses` fails on the **read**, not the write.
  `seed` writes straight through the ORM and the column is `sa.Text()`, so the row is stored happily.
  The failure comes from the read side: `ApplicationListItem.current_status` is typed `Status`, so the
  unknown value cannot be validated and the `GET` raises rather than returning rows. You will see a
  `pydantic_core.ValidationError` for `ApplicationListItem` raised inside the route at
  `app/routers/applications.py:67` - the route constructs `ApplicationListItem` explicitly rather
  than handing ORM rows to FastAPI, so this fires in the route body, not in the response layer. Not a
  clean assertion diff either way.

That second failure is the useful one to have seen: it proves the API's own response model is what
constrains the vocabulary, which is why no database migration is involved anywhere in this plan.

If instead you get a connection error that hangs for a minute and then reports `server closed the
connection unexpectedly`, check whether Proton VPN is connected before debugging anything else. See
`.agents/notes/local-database-access.md`.

- [x] **Step 3: Add the enum member**

In `backend/app/schemas.py`, insert one line into `Status`, between `INTERVIEW` and `OFFER`. Do not
touch `CLOSED_STATUSES`.

```python
class Status(StrEnum):
    CONTACTED = "Contacted"
    APPLIED = "Applied"
    INTERVIEW = "Interview"
    TECH_TEST = "Tech test"
    OFFER = "Offer"
    REJECTED = "Rejected"
    WITHDRAWN = "Withdrawn"


CLOSED_STATUSES = (Status.REJECTED, Status.WITHDRAWN)
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `uv run pytest tests/test_applications.py -k "include_closed or tech_test" -v`

Expected: both PASS.

- [x] **Step 5: Run the whole backend suite**

Run: `uv run pytest`

Expected: all PASS. Nothing else in the suite enumerates the statuses, so no other test should move.

- [x] **Step 6: Lint**

Run: `uv run ruff check . && uv run ruff format --check .`

Expected: no findings.

- [x] **Step 7: Re-export the OpenAPI schema**

Run: `uv run python -m scripts.export_openapi`

Expected: `wrote .../backend/openapi.json`.

- [x] **Step 8: Verify the schema actually changed**

Run: `git -C .. diff --stat backend/openapi.json && grep -c "Tech test" openapi.json`

Expected: `openapi.json` appears in the diffstat, and the grep prints a count of at least `1`. If
the count is `0`, Step 3 did not land or Step 7 was not run - fix before continuing, because Task 2
reads this file.

- [x] **Step 9: Commit**

```bash
git add backend/app/schemas.py backend/tests/test_applications.py backend/openapi.json
git commit -m "feat: add Tech test status to the status vocabulary"
```

---

## Task 2: The generated frontend types carry the new value

**Files:**
- Regenerate: `frontend/src/lib/api-types.ts`

**Interfaces:**
- Consumes: `backend/openapi.json` from Task 1.
- Produces: `components["schemas"]["Status"]`, now the seven-member union
  `"Contacted" | "Applied" | "Interview" | "Tech test" | "Offer" | "Rejected" | "Withdrawn"`.
  Task 3's `Status` type alias resolves to this.

This task is a regeneration, not an edit. It gets its own commit so the generated diff is separable
from the hand-written one. All commands run from `frontend/`.

- [x] **Step 1: Regenerate**

Run: `npm run gen:types`

- [x] **Step 2: Verify the union grew**

Run: `grep -n "        Status:" src/lib/api-types.ts`

Expected: one line reading

```
        Status: "Contacted" | "Applied" | "Interview" | "Tech test" | "Offer" | "Rejected" | "Withdrawn";
```

If `Tech test` is absent, Task 1 Step 7 did not run. Go back and run it.

- [x] **Step 3: Confirm the type check now fails**

Run: `npx next typegen && npx tsc --noEmit`

Expected: FAIL, on `src/lib/status.ts`, with an error along the lines of `Property 'Tech test' is
missing in type` for the `CLASSES` record. This is the point of running it: `CLASSES` is a
`Record<Status, string>`, so widening the union makes the missing key a compile error. That error is
what Task 3 fixes.

`next typegen` is required first: `PageProps` and `LayoutProps` are generated into `.next/types/`,
which is gitignored, so `tsc` on a fresh checkout fails for unrelated reasons without it.

- [x] **Step 4: Commit**

```bash
git add src/lib/api-types.ts
git commit -m "chore: regenerate api types for the Tech test status"
```

---

## Task 3: The frontend knows the status, its position, and its colour

**Files:**
- Modify: `frontend/src/lib/status.ts`
- Modify: `frontend/src/lib/status.test.ts`

**Interfaces:**
- Consumes: the seven-member `Status` union from Task 2.
- Produces: `STATUSES` as a seven-element array in wire order, and `statusClasses("Tech test")`
  returning a violet class string. Every dropdown and the Zod schema pick both up without change,
  because they all read `STATUSES`.

All commands run from `frontend/`.

- [x] **Step 1: Write the failing tests**

In `frontend/src/lib/status.test.ts`, add the new status to the `isClosed` table, in its wire
position, and add one colour assertion. The three other tests in the file - full coverage of
`CLASSES`, one distinct colour per status, and a `dark:` variant everywhere - already iterate
`STATUSES`, so they extend themselves and need no edit.

Replace the `isClosed` describe block:

```ts
describe("isClosed", () => {
  it.each<[Status, boolean]>([
    ["Contacted", false],
    ["Applied", false],
    ["Interview", false],
    ["Tech test", false],
    ["Offer", false],
    ["Rejected", true],
    ["Withdrawn", true],
  ])("%s -> %s", (status, closed) => {
    expect(isClosed(status)).toBe(closed);
  });
});
```

Add one line to the existing `"uses the colours the spec asks for"` test, after the `Interview`
assertion:

```ts
    expect(statusClasses("Tech test")).toContain("violet");
```

Add one new test to the `statusClasses` describe block, asserting the order. The dropdowns render
`STATUSES` in array order, so the order is behaviour, not formatting.

```ts
  it("lists the statuses as a funnel", () => {
    expect(STATUSES).toEqual([
      "Contacted",
      "Applied",
      "Interview",
      "Tech test",
      "Offer",
      "Rejected",
      "Withdrawn",
    ]);
  });
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/status.test.ts`

Expected: FAIL. The order test reports the six-element array, the colour test reports the
`undefined` returned for a missing key, and `isClosed("Tech test")` may pass by accident since
`CLOSED.includes` returns false for an unknown value - that is fine, the other two carry the task.

- [x] **Step 3: Add the status to the array and the colour map**

In `frontend/src/lib/status.ts`, insert `"Tech test"` into `STATUSES` between `"Interview"` and
`"Offer"`, and add the violet entry to `CLASSES` in the same position. Leave `CLOSED` alone.

```ts
export const STATUSES: readonly Status[] = [
  "Contacted",
  "Applied",
  "Interview",
  "Tech test",
  "Offer",
  "Rejected",
  "Withdrawn",
] as const;

const CLOSED: readonly Status[] = ["Rejected", "Withdrawn"] as const;
```

And in `CLASSES`, between the `Interview` and `Offer` entries:

```ts
  "Tech test":
    "border-violet-300 bg-violet-100 text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200",
```

The key needs quoting because it contains a space. The other six keys stay unquoted - do not quote
them for consistency, the linter will not ask for it.

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/status.test.ts`

Expected: all PASS, including the two that iterate `STATUSES` and now cover seven entries.

- [x] **Step 5: Run the whole Vitest suite and the type check**

Run: `npm run test && npx next typegen && npx tsc --noEmit && npm run lint`

Expected: all PASS. The `tsc` failure introduced in Task 2 Step 3 is now resolved, which is the
proof that `CLASSES` covers the widened union.

- [x] **Step 6: Commit**

```bash
git add src/lib/status.ts src/lib/status.test.ts
git commit -m "feat: render the Tech test status with a violet badge"
```

---

## Task 4: The value survives the browser-to-Neon round trip

**Files:**
- Modify: `frontend/e2e/timeline.spec.ts:30-41`

**Interfaces:**
- Consumes: Tasks 1-3. Both services must be running.
- Produces: nothing other tasks read.

This task changes one existing test rather than adding a spec. `addUpdate` and `editUpdate` in
`frontend/e2e/helpers.ts` select by visible label, so passing the new label is the whole change, and
it proves the value reaches Postgres and comes back as the derived current status.

Two locator facts to respect, because getting them wrong is the likely mistake here:

- `addUpdate(page, status, date, note?)` selects by the visible label, so `"Tech test"` needs to be
  the exact option text. It is - `STATUSES` is rendered verbatim as the option value and label.
- `row(page, title)` is the **list screen** locator, never a timeline entry. After `addUpdate` the
  browser is still on the detail page, so a `row(...)` assertion there fails. `timeline(page)` is the
  detail-page locator. The existing test already navigates with `page.goto("/")` before it uses
  `row(...)`; keep that ordering.

- [x] **Step 1: Point one existing test at the new status**

In `frontend/e2e/timeline.spec.ts`, change the test at line 30,
`"correcting an entry's status and note persists"`, so the entry it creates is a `Tech test` and the
correction moves it to `Offer`. The database is emptied once at the start of the run and not between
tests, so the title stays unique to this test - keep `"Wrong status"` rather than renaming it, and
leave the surrounding tests alone.

Replace the whole test with this. Two lines change from the current version: the `addUpdate` status,
and one added assertion on the timeline.

```ts
test("correcting an entry's status and note persists", async ({ page }) => {
  await createApplication(page, { title: "Wrong status", date: "2026-08-02" });
  await addUpdate(page, "Tech test", "2026-08-10", "was actually an offer");

  await expect(timeline(page)).toContainText("Tech test");

  await editUpdate(page, "was actually an offer", { status: "Offer", note: "offer received" });

  await page.reload();
  await expect(timeline(page)).toContainText("offer received");
  await expect(timeline(page)).not.toContainText("was actually an offer");
  await page.goto("/");
  await expect(row(page, "Wrong status")).toContainText("Offer");
});
```

`timeline` is already imported in this file - check the import list at the top and do not add a
duplicate.

- [x] **Step 2: Do not start anything by hand**

`frontend/playwright.config.ts` has a `webServer` array that starts both services itself and tears
them down after. Starting your own would collide, because the backend entry sets
`reuseExistingServer: false`.

What it does, so nothing below is a surprise:

- FastAPI on port 8100, from `../backend`, pointed at `TEST_DATABASE_URL`, with `AI_STUB=true`. The
  analyse call is server-side, so the stub seam has to be in the backend, not in `page.route()`.
- The frontend as a **production build**: `npm run build && npm run start`. That build runs
  `gen:types` first, so a stale `api-types.ts` surfaces here as a build failure.
- `workers: 1`, `fullyParallel: false`. The suite shares one database and is deliberately serial.

Expect the first run to take a few minutes: the frontend `webServer` has a 180 second timeout
because it compiles before serving. That is normal, not a hang.

- [x] **Step 3: Run the timeline spec**

Run, from `frontend/`: `npx playwright test e2e/timeline.spec.ts`

Expected: all PASS. If the status dropdown has no `Tech test` option, Task 3 did not land or the dev
server is serving a stale build - restart `npm run dev`.

- [x] **Step 4: Run the whole end-to-end suite**

Run: `npm run test:e2e`

Expected: all PASS. This is the only check that exercises browser to Next to FastAPI to Neon
together, so run it whole and not just the one spec.

- [x] **Step 5: Commit**

```bash
git add e2e/timeline.spec.ts
git commit -m "test: drive the Tech test status end to end"
```

---

## Task 5: The spec stops saying six

**Files:**
- Modify: `AGENTS.md:51-61`, `AGENTS.md:255`, `AGENTS.md:442-447`, `AGENTS.md:463-465`

**Interfaces:**
- Consumes: Tasks 1-4 complete.
- Produces: nothing. This is the task that stops `AGENTS.md` lying to the next reader.

Line numbers are from before any edit in this task. Work top to bottom and they stay valid, since
every change is in place and none adds or removes a line except the two table rows.

- [x] **Step 1: Update the status vocabulary table**

In the `### Status vocabulary` section, change the opening sentence and add a row. It currently
reads `Six statuses, derived from the spreadsheet's` - the count is now wrong.

Replace `Six statuses, derived from the spreadsheet's \`Etat\` column and translated to English:`
with:

```markdown
Seven statuses. Six are derived from the spreadsheet's `Etat` column and translated to English; the
seventh, `Tech test`, has no spreadsheet origin.
```

Then insert one row into the table, between `Interview` and `Offer`:

```markdown
| `Tech test`  | A technical test or take-home happened (repeatable) | -              |
```

Re-align the table's pipes with the widest cell after inserting, so the column edges still line up.

- [x] **Step 2: Note that the new status repeats too**

Immediately below the table, the bullet at line 42 says interview rounds are not distinct statuses.
The same reasoning covers tests. Extend the existing bullet in the
`### Status updates are the source of truth` section:

```markdown
- Interview rounds are not distinct statuses. Two `Interview` updates on different dates *is* a
  second round; the dates supply the ordering and the notes supply the detail. `Tech test` repeats
  the same way - a screening test and a later take-home are two updates, not two statuses.
```

- [x] **Step 3: Update the schema comment**

In the `### Schema` block, the `status_updates.status` line enumerates the legal values. Replace it:

```
  status         text        not null   -- Contacted | Applied | Interview | Tech test | Offer | Rejected | Withdrawn
```

Note for the reader: this is a comment in a fenced block, not DDL. There is no `CHECK` constraint
and no Postgres enum, which is exactly why this change needed no migration.

- [x] **Step 4: Update the colour table**

In the `## Color Scheme` section, insert one row between `Interview` and `Offer`:

```markdown
| `Tech test`  | Violet  | Active, awaiting your work         |
```

Re-align the pipes as in Step 1.

- [x] **Step 5: Correct the deferred decision that ruled this out**

The `## Deferred decisions` section contains a bullet beginning
`**No \`Screening\` or \`Ghosted\` status.**` A recruiter phone call is still an `Interview` and
silence is still a `Rejected` with a note, so most of it stands - but it now needs to say what
changed and why a test earned its own status when a screening call did not.

```markdown
- **No `Screening` or `Ghosted` status.** A recruiter phone call is an `Interview`; silence is
  recorded as `Rejected` with a note, matching the existing `No response within a month = Rejected`
  convention. `Tech test` was added on 21 Aug 2026 as the one exception: a take-home is work the
  candidate does alone, on a deadline, and lumping it under `Interview` hid the distinction that
  actually matters when reading the timeline back. Adding it cost one enum member and one colour,
  because `status` is `text` with no constraint.
```

- [x] **Step 6: Verify no stale count survives**

Run, from the repository root:

```bash
grep -n "Six statuses\|six statuses" AGENTS.md
grep -c "Tech test" AGENTS.md
```

Expected: the first prints nothing, the second prints at least `5`.

- [x] **Step 7: Commit**

```bash
git add AGENTS.md
git commit -m "docs: record the Tech test status in the spec"
```

---

## Task 6: The whole pipeline is green

**Files:** none. This task runs checks and pushes.

**Interfaces:**
- Consumes: Tasks 1-5 committed.
- Produces: a `main` that CI can deploy.

- [ ] **Step 1: Run everything CI runs, locally**

From `backend/`:

```bash
uv run ruff check . && uv run ruff format --check . && uv run pytest
```

From `frontend/`:

```bash
npm run gen:types && npm run lint && npm run test && npx next typegen && npx tsc --noEmit
```

Expected: all PASS. `gen:types` here is a check as much as a step - if it dirties
`src/lib/api-types.ts`, Task 2 committed a stale file. Run `git status --short src/lib/api-types.ts`
and commit the difference if there is one.

- [ ] **Step 2: Confirm nothing from this change is uncommitted**

Run, from the root: `git status --short`

Expected: only these entries, all of which were already dirty before this plan started and are
unrelated to it - skill scaffolding and this plan file itself:

```
 M .gitignore
 M skills-lock.json
?? .agents/plans/21-08-2026-tech-test-status.md
?? .agents/skills/caveman/
?? .agents/skills/writing-plans/
?? .claude/skills/caveman/
?? .claude/skills/writing-plans/
```

Anything else listed - any file under `backend/app`, `backend/tests`, `frontend/src`,
`frontend/e2e`, or `AGENTS.md` - is a change one of the tasks above forgot to commit. Commit it to
the task it belongs to before pushing.

Do **not** commit the pre-existing entries as part of this change. They are the user's, they predate
this work, and sweeping them into a status-vocabulary commit would mix two unrelated things. Leave
them exactly as they are and mention them when you hand back.

- [ ] **Step 3: Push**

`.github/workflows/ci.yml` is the only route to production. It migrates the Neon `test` branch,
runs `backend`, `frontend` and `e2e`, and only then deploys. There is no new migration in this
change, so the `migrate` job is a no-op and the interesting gate is `e2e`.

```bash
git push origin main
```

- [ ] **Step 4: Watch the run**

Run: `gh run watch`

Expected: all six jobs green. `pytest` and Playwright share the Neon `test` branch and both truncate
it, so a queued run behind another push is normal, not a hang - the repository-wide `concurrency`
group serialises them rather than cancelling.

- [ ] **Step 5: Confirm the deployed API serves the new value**

Run: `curl -s https://job-application-assistant-api.vercel.app/openapi.json | grep -c "Tech test"`

Expected: at least `1`. Expect roughly a second of cold start on the first request. If the count is
`0`, `deploy-api` did not run or did not pick up the commit - check `gh run view` before touching
the frontend.

- [ ] **Step 6: Confirm the UI offers it**

Open the deployed frontend, log in, open any application's detail screen, and open the status
dropdown on the add-update form. `Tech test` sits between `Interview` and `Offer`. Add one, and check
the badge renders violet in both light and dark mode, with the label `Tech test` visible on it.

---

## Success criteria

Tick these only when each has actually been observed, not inferred.

- [ ] `POST /applications/{id}/status-updates` with `"status": "Tech test"` returns `201`, and the
      application's `current_status` comes back as `Tech test`.
- [ ] `GET /applications` without `include_closed` still returns an application whose latest update
      is a `Tech test`. It is an open status.
- [ ] No Alembic migration was written, and `alembic heads` is unchanged.
- [ ] `backend/openapi.json` and `frontend/src/lib/api-types.ts` are both committed and both contain
      `Tech test`. Neither was hand-edited.
- [ ] `Tech test` appears between `Interview` and `Offer` in all three status dropdowns: the create
      form, the add-update form, and the edit-update dialog.
- [ ] The badge is violet and legible in light and dark mode, and carries the text `Tech test`.
- [ ] `uv run pytest`, `npm run test`, `npx tsc --noEmit` and `npm run test:e2e` all pass.
- [ ] `AGENTS.md` says seven statuses, lists `Tech test` in the vocabulary table, the schema comment
      and the colour table, and its deferred-decisions note explains why this one was added.
