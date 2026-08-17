# Edit and Delete Timeline Entries - Implementation Plan

> **For agentic workers:** use the `executing-plans` skill to work through this plan task by task.
> Steps use checkbox (`- [ ]`) syntax for tracking. Tick them as you go.

**Goal:** Let a single status update be corrected or removed from the application detail screen,
instead of the timeline being append-only.

**Architecture:** Two new routes on the existing applications router, `PATCH` and `DELETE` on
`/applications/{id}/status-updates/{update_id}`, both scoped by the application id so an update can
never be reached through the wrong parent. The frontend gains one dialog per timeline row, opened
from an `Edit` button, holding the three fields plus a delete button. Nothing about the derived
current status changes: it is still `max(date)` tie-broken by `created_at`, so an edited date simply
re-derives it.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Pydantic v2, pytest (backend); Next.js 16 App Router,
Server Actions, shadcn/ui dialog, Zod, Playwright (frontend).

**Spec:** `AGENTS.md`. Read it before starting. Note that it currently **forbids** this feature - the
API section says "Status updates cannot be edited or deleted individually", and Deferred decisions
carries "The timeline is append-only". Task 7 rewrites both. Until then, the spec and the plan
disagree on purpose, and the plan wins.

## Decisions closed before planning

| Question                          | Answer                                                                    |
| --------------------------------- | ------------------------------------------------------------------------- |
| Scope                             | Edit **and** delete a single update                                       |
| Deleting the last update          | Refused. Every application keeps at least one update                      |
| UI                                | One dialog per timeline row; delete lives inside that dialog              |
| Editable fields                   | All three: `status`, `date`, `note`                                       |
| Finish line                       | Both suites green, then both Vercel projects redeployed and smoke-tested   |
| Schema migration                  | None. No column changes, so no Alembic revision in this increment          |

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
- Status updates keep no `updated_at`; an edit rewrites `date`, `status` and `note` only, never
  `created_at`.
- Commit messages: imperative sentence-case title, body paragraphs saying why, and the trailer
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. No `feat:` prefixes - the
  repo does not use them.

## Before you start

- [ ] Branch off `main`: `git switch -c edit-application-timeline`
- [ ] `git status` will already show `M skills-lock.json` and untracked `.agents/skills/` and
      `.claude/skills/` directories. They are unrelated to this work. Every commit step below uses
      an explicit `git add <paths>`; never `git add -A`, or those get swept in.
- [ ] Confirm the baseline is green before changing anything:
      `cd backend && uv run pytest` (45 tests) and `cd frontend && npm test`.

## File Structure

| File                                                | Responsibility                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `backend/app/schemas.py`                            | Modify: add `StatusUpdatePatch`                                    |
| `backend/app/routers/applications.py`               | Modify: add `_load_update`, the PATCH and the DELETE routes        |
| `backend/tests/test_applications.py`                | Modify: new contract tests, plus the route inventory and auth lists |
| `backend/openapi.json`                              | Regenerate                                                         |
| `frontend/src/lib/api-types.ts`                     | Regenerate                                                         |
| `frontend/src/lib/api.ts`                           | Modify: `patchStatusUpdate`, `deleteStatusUpdate`                  |
| `frontend/src/app/applications/actions.ts`          | Modify: `editStatusUpdateAction`, `deleteStatusUpdateAction`       |
| `frontend/src/components/edit-update-dialog.tsx`    | Create: the dialog and its form                                    |
| `frontend/src/app/applications/[id]/page.tsx`       | Modify: an `Edit` button on each timeline row                      |
| `frontend/e2e/helpers.ts`                           | Modify: `openUpdateDialog`, `editUpdate`, `deleteUpdate`           |
| `frontend/e2e/timeline.spec.ts`                     | Create: the four new end-to-end cases                              |
| `AGENTS.md`                                         | Modify: four passages that say the timeline is append-only         |

`README.md` needs no change. It lists no endpoints, and its regenerate and deploy commands already
cover what this increment does.

**Vitest gets no new tests.** The spec is explicit that render-only components do not get tests
written to reach a coverage number, and this increment adds no new frontend logic - no date
formatting, no status-to-colour mapping. `npm test` must still pass unchanged.

---

## Task 1: Backend - PATCH one status update

**Files:**

- Modify: `backend/app/schemas.py` (add after `StatusUpdateCreate`, around line 34)
- Modify: `backend/app/routers/applications.py`
- Test: `backend/tests/test_applications.py`

**Interfaces:**

- Consumes: `Application`, `StatusUpdate` from `app.models`; `_load`, `SessionDep`, `router` from
  `app.routers.applications`; the `client`, `session` and `seed` fixtures from `tests/conftest.py`.
- Produces:
  - `app.schemas.StatusUpdatePatch` - all three fields optional; `date` and `status` reject an
    explicit `null`.
  - `PATCH /applications/{application_id}/status-updates/{update_id}` -> `200` with the full
    `ApplicationDetail`, `404` if the update does not exist **or** belongs to another application,
    `422` on a bad field.
  - `app.routers.applications._load_update(session, application_id, update_id) -> StatusUpdate` -
    used again by Task 2.
  - `tests/test_applications.py::first_update_id(client, application_id) -> str` - used again by
    Task 2.

### Steps

- [ ] **Step 1: Add the helpers and the failing tests**

At the top of `backend/tests/test_applications.py`, add one helper below the existing `create`:

```python
async def first_update_id(client, application_id: str) -> str:
    detail = (await client.get(f"/applications/{application_id}")).json()
    return detail["updates"][0]["id"]
```

Update the two existing inventory tests. `test_openapi_exposes_exactly_the_seven_routes` becomes:

```python
def test_openapi_exposes_exactly_the_expected_routes():
    exposed = {
        (path, method.upper())
        for path, operations in app.openapi()["paths"].items()
        for method in operations
    }
    assert exposed == {
        ("/health", "GET"),
        ("/applications", "GET"),
        ("/applications", "POST"),
        ("/applications/{application_id}", "GET"),
        ("/applications/{application_id}", "PATCH"),
        ("/applications/{application_id}", "DELETE"),
        ("/applications/{application_id}/status-updates", "POST"),
        ("/applications/{application_id}/status-updates/{update_id}", "PATCH"),
    }
```

In `test_every_application_route_requires_the_api_key`, add the new route to the parametrize list
and widen the `format` call so a path with two placeholders still fills in:

```python
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/applications"),
        ("POST", "/applications"),
        ("GET", "/applications/{id}"),
        ("PATCH", "/applications/{id}"),
        ("DELETE", "/applications/{id}"),
        ("POST", "/applications/{id}/status-updates"),
        ("PATCH", "/applications/{id}/status-updates/{update_id}"),
    ],
)
async def test_every_application_route_requires_the_api_key(anonymous_client, method, path):
    url = path.format(id=uuid.uuid4(), update_id=uuid.uuid4())
    body = payload() if method in {"POST", "PATCH"} else None
    response = await anonymous_client.request(method, url, json=body)
    assert response.status_code == 401
```

Append the new cases at the end of the file:

```python
async def test_patch_status_update_changes_only_the_fields_given(client):
    application_id = await create(client)
    update_id = await first_update_id(client, application_id)

    response = await client.patch(
        f"/applications/{application_id}/status-updates/{update_id}",
        json={"note": "corrected"},
    )

    assert response.status_code == 200, response.text
    entry = response.json()["updates"][0]
    assert entry["note"] == "corrected"
    assert entry["date"] == "2026-08-01"
    assert entry["status"] == "Applied"


async def test_patch_status_update_can_clear_the_note(client):
    application_id = await create(client)
    update_id = await first_update_id(client, application_id)
    url = f"/applications/{application_id}/status-updates/{update_id}"
    await client.patch(url, json={"note": "typo"})

    response = await client.patch(url, json={"note": None})

    assert response.json()["updates"][0]["note"] is None


async def test_patch_moving_a_date_back_moves_the_current_status(client):
    application_id = await create(client)  # Applied on 2026-08-01
    added = await client.post(
        f"/applications/{application_id}/status-updates",
        json={"date": "2026-08-09", "status": "Interview"},
    )
    interview_id = added.json()["updates"][0]["id"]

    body = (
        await client.patch(
            f"/applications/{application_id}/status-updates/{interview_id}",
            json={"date": "2026-07-25"},
        )
    ).json()

    # The response carries the re-derived timeline, not the order it was written in.
    assert [u["date"] for u in body["updates"]] == ["2026-08-01", "2026-07-25"]
    assert body["current_status"] == "Applied"
    assert body["last_update_date"] == "2026-08-01"

    listed = (await client.get("/applications")).json()
    assert listed[0]["current_status"] == "Applied"
    assert listed[0]["last_update_date"] == "2026-08-01"


async def test_patch_a_status_can_close_an_application(client):
    application_id = await create(client)
    update_id = await first_update_id(client, application_id)

    await client.patch(
        f"/applications/{application_id}/status-updates/{update_id}",
        json={"status": "Withdrawn"},
    )

    assert (await client.get("/applications")).json() == []
    everything = (await client.get("/applications", params={"include_closed": True})).json()
    assert [row["current_status"] for row in everything] == ["Withdrawn"]


async def test_editing_a_date_into_a_tie_still_resolves_by_created_at(client):
    """An edit rewrites date, never created_at, so the original write order breaks the tie."""
    application_id = await create(client)  # Applied on 2026-08-01, written first
    added = await client.post(
        f"/applications/{application_id}/status-updates",
        json={"date": "2026-08-09", "status": "Interview"},
    )
    interview_id = added.json()["updates"][0]["id"]

    body = (
        await client.patch(
            f"/applications/{application_id}/status-updates/{interview_id}",
            json={"date": "2026-08-01"},
        )
    ).json()

    assert body["current_status"] == "Interview"
    assert [u["status"] for u in body["updates"]] == ["Interview", "Applied"]


async def test_patch_through_another_applications_id_is_404(client):
    mine = await create(client)
    theirs = await create(client, title="Someone else")
    theirs_update = await first_update_id(client, theirs)

    response = await client.patch(
        f"/applications/{mine}/status-updates/{theirs_update}", json={"status": "Offer"}
    )

    assert response.status_code == 404
    assert (await client.get(f"/applications/{theirs}")).json()["current_status"] == "Applied"


async def test_patch_an_unknown_status_update_is_404(client):
    application_id = await create(client)

    response = await client.patch(
        f"/applications/{application_id}/status-updates/{uuid.uuid4()}", json={"status": "Offer"}
    )

    assert response.status_code == 404


async def test_patching_a_status_update_on_an_unknown_application_is_404(client):
    response = await client.patch(
        f"/applications/{uuid.uuid4()}/status-updates/{uuid.uuid4()}", json={"status": "Offer"}
    )

    assert response.status_code == 404


@pytest.mark.parametrize("field", ["date", "status"])
async def test_patch_cannot_null_a_status_updates_date_or_status(client, field):
    application_id = await create(client)
    update_id = await first_update_id(client, application_id)

    response = await client.patch(
        f"/applications/{application_id}/status-updates/{update_id}", json={field: None}
    )

    assert response.status_code == 422


async def test_patch_an_unknown_status_value_is_422(client):
    application_id = await create(client)
    update_id = await first_update_id(client, application_id)

    response = await client.patch(
        f"/applications/{application_id}/status-updates/{update_id}", json={"status": "Ghosted"}
    )

    assert response.status_code == 422
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `backend/`: `uv run pytest tests/test_applications.py -q`

Expected: the ten new cases plus the two inventory tests fail. The route tests fail with
`assert 405 == 200` or `404`, because the path does not exist yet.

- [ ] **Step 3: Add `StatusUpdatePatch` to `app/schemas.py`**

Insert directly after `StatusUpdateCreate`:

```python
class StatusUpdatePatch(BaseModel):
    date: datetime.date | None = None
    status: Status | None = None
    note: str | None = None

    @field_validator("date", "status")
    @classmethod
    def reject_explicit_null(cls, value: datetime.date | Status) -> datetime.date | Status:
        """Defaults skip validation, so this only fires when the field was sent as null."""
        if value is None:
            raise ValueError("cannot be cleared")
        return value
```

`note` is deliberately nullable: sending `null` clears it, not sending it leaves it. Same asymmetry
as `comment` on `ApplicationPatch`.

- [ ] **Step 4: Add the route to `app/routers/applications.py`**

Add `StatusUpdatePatch` to the `app.schemas` import block. Then add the lookup helper below `_load`:

```python
def _load_update(
    session: Session, application_id: uuid.UUID, update_id: uuid.UUID
) -> StatusUpdate:
    # Scoped by the parent, so an update can never be reached through the wrong application - and
    # an unknown application id therefore matches nothing, which is the 404 we want anyway.
    update = session.get(StatusUpdate, update_id)
    if update is None or update.application_id != application_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Status update not found")
    return update
```

And the route at the end of the file:

```python
@router.patch("/{application_id}/status-updates/{update_id}", response_model=ApplicationDetail)
def update_status_update(
    application_id: uuid.UUID,
    update_id: uuid.UUID,
    payload: StatusUpdatePatch,
    session: SessionDep,
):
    update = _load_update(session, application_id, update_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(update, field, value)
    session.flush()
    application = update.application
    # Both derived fields read updates[0]. The refresh re-runs the relationship's ORDER BY, so an
    # edited date reorders the timeline in the response rather than returning the loaded order.
    session.refresh(application)
    return application
```

If `test_patch_moving_a_date_back_moves_the_current_status` still sees the old order, the collection
was not expired - replace the refresh with `session.expire(application, ["updates"])`.

- [ ] **Step 5: Run the tests to verify they pass**

Run from `backend/`: `uv run pytest -q`

Expected: PASS, 57 tests (45 existing + 12 new, counting the two parametrized cases).

- [ ] **Step 6: Lint**

Run from `backend/`: `uv run ruff check . && uv run ruff format --check .`

Expected: no findings.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas.py backend/app/routers/applications.py backend/tests/test_applications.py
git commit -m "Allow a status update to be edited

PATCH /applications/{id}/status-updates/{update_id} rewrites date, status
and note. The lookup is scoped by the parent application, so a valid update
id under the wrong application is a 404 rather than a cross-record edit.

created_at is never rewritten, so an entry edited onto a date it now shares
with another still ties by original write order. There is a test for it.

The response refreshes the application before returning, since both derived
fields read updates[0] and an edited date has to reorder the timeline.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Backend - DELETE one status update

**Files:**

- Modify: `backend/app/routers/applications.py`
- Test: `backend/tests/test_applications.py`

**Interfaces:**

- Consumes: `_load_update` and `first_update_id` from Task 1.
- Produces: `DELETE /applications/{application_id}/status-updates/{update_id}` -> `204` on success,
  `409` when it is the application's only update, `404` when unknown or owned by another
  application.

### Steps

- [ ] **Step 1: Write the failing tests**

Extend the inventory test from Task 1 with the ninth route:

```python
        ("/applications/{application_id}/status-updates/{update_id}", "PATCH"),
        ("/applications/{application_id}/status-updates/{update_id}", "DELETE"),
```

And the auth parametrize list with:

```python
        ("DELETE", "/applications/{id}/status-updates/{update_id}"),
```

Append the new cases:

```python
async def test_delete_a_status_update_reverts_the_current_status(client, session):
    application_id = await create(client)
    added = await client.post(
        f"/applications/{application_id}/status-updates",
        json={"date": "2026-08-09", "status": "Rejected"},
    )
    rejected_id = added.json()["updates"][0]["id"]

    response = await client.delete(f"/applications/{application_id}/status-updates/{rejected_id}")

    assert response.status_code == 204
    detail = (await client.get(f"/applications/{application_id}")).json()
    assert [u["date"] for u in detail["updates"]] == ["2026-08-01"]
    assert detail["current_status"] == "Applied"
    assert session.execute(select(func.count()).select_from(StatusUpdate)).scalar() == 1


async def test_deleting_the_only_status_update_is_409(client):
    application_id = await create(client)
    update_id = await first_update_id(client, application_id)

    response = await client.delete(f"/applications/{application_id}/status-updates/{update_id}")

    assert response.status_code == 409
    assert len((await client.get(f"/applications/{application_id}")).json()["updates"]) == 1


async def test_delete_a_status_update_through_another_applications_id_is_404(client, session):
    mine = await create(client)
    theirs = await create(client, title="Someone else")
    theirs_update = await first_update_id(client, theirs)

    response = await client.delete(f"/applications/{mine}/status-updates/{theirs_update}")

    assert response.status_code == 404
    assert session.execute(select(func.count()).select_from(StatusUpdate)).scalar() == 2


async def test_deleting_an_unknown_status_update_is_404(client):
    application_id = await create(client)

    response = await client.delete(
        f"/applications/{application_id}/status-updates/{uuid.uuid4()}"
    )

    assert response.status_code == 404
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `backend/`: `uv run pytest tests/test_applications.py -q -k "delete_a_status_update or only_status_update or unknown_status_update or expected_routes"`

Expected: FAIL with `405` on the DELETE cases and a set mismatch on the inventory test.

- [ ] **Step 3: Add the route**

Add `func` to the `sqlalchemy` import: `from sqlalchemy import func, select, true`. Then, at the end
of `app/routers/applications.py`:

```python
@router.delete(
    "/{application_id}/status-updates/{update_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_status_update(application_id: uuid.UUID, update_id: uuid.UUID, session: SessionDep):
    update = _load_update(session, application_id, update_id)
    remaining = session.scalar(
        select(func.count())
        .select_from(StatusUpdate)
        .where(StatusUpdate.application_id == application_id)
    )
    # The current status is derived from the updates, so an application with none has no status.
    if remaining == 1:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "An application must keep at least one status update"
        )
    session.delete(update)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

The `HTTPException` leaves `get_session` without reaching its `commit()`, so the refused delete
writes nothing.

- [ ] **Step 4: Run the whole suite**

Run from `backend/`: `uv run pytest -q`

Expected: PASS, 62 tests.

- [ ] **Step 5: Lint**

Run from `backend/`: `uv run ruff check . && uv run ruff format --check .`

Expected: no findings.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/applications.py backend/tests/test_applications.py
git commit -m "Allow a status update to be deleted

DELETE /applications/{id}/status-updates/{update_id} removes one timeline
entry and lets the current status re-derive from what is left.

Deleting the last remaining update is a 409. An application with no updates
would have no derivable status, which the spec rules out, so the guard is in
the API rather than only in the UI that hides the button.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Contract surface - regenerate the schema, types and API client

**Files:**

- Modify: `backend/openapi.json` (generated)
- Modify: `frontend/src/lib/api-types.ts` (generated)
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**

- Consumes: the two routes and `StatusUpdatePatch` from Tasks 1 and 2.
- Produces:
  - `StatusUpdatePatch` type export from `@/lib/api`.
  - `patchStatusUpdate(applicationId: string, updateId: string, body: StatusUpdatePatch) => Promise<ApplicationDetail>`
  - `deleteStatusUpdate(applicationId: string, updateId: string) => Promise<void>`

### Steps

- [ ] **Step 1: Regenerate the OpenAPI document**

Run from `backend/`: `uv run python -m scripts.export_openapi`

It must run as a module. Running it by path puts `scripts/` on `sys.path` instead of `backend/` and
the `app` import fails.

- [ ] **Step 2: Confirm the new surface landed**

```bash
git -C . diff --stat backend/openapi.json
grep -c "status-updates/{update_id}" backend/openapi.json
```

Expected: the file changed, and the new path appears (one occurrence - `paths` keys it once, with
`patch` and `delete` under it).

- [ ] **Step 3: Regenerate the TypeScript types**

Run from `frontend/`: `npm run gen:types`

Then confirm `StatusUpdatePatch` is in the output:

```bash
grep -n "StatusUpdatePatch" src/lib/api-types.ts
```

Expected: a `StatusUpdatePatch: { date?: ...; status?: ...; note?: ... }` schema entry. Do not edit
this file by hand under any circumstances.

- [ ] **Step 4: Add the two client functions**

In `frontend/src/lib/api.ts`, add the type export beside the others:

```ts
export type StatusUpdatePatch = components["schemas"]["StatusUpdatePatch"];
```

And the two calls at the end of the file, after `addStatusUpdate`:

```ts
export function patchStatusUpdate(
  applicationId: string,
  updateId: string,
  body: StatusUpdatePatch,
) {
  return call<ApplicationDetail>(`/applications/${applicationId}/status-updates/${updateId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteStatusUpdate(applicationId: string, updateId: string) {
  return call<void>(`/applications/${applicationId}/status-updates/${updateId}`, {
    method: "DELETE",
  });
}
```

- [ ] **Step 5: Typecheck and confirm regeneration is stable**

Run from `frontend/`:

```bash
npx tsc --noEmit
npm run gen:types && git diff --quiet src/lib/api-types.ts && echo "stable"
```

Expected: `tsc` silent, and `stable` printed - a second generation produces no diff.

- [ ] **Step 6: Commit**

```bash
git add backend/openapi.json frontend/src/lib/api-types.ts frontend/src/lib/api.ts
git commit -m "Carry the two new routes across the boundary

openapi.json regenerated from the Pydantic models, api-types.ts regenerated
from it, and patchStatusUpdate and deleteStatusUpdate added to the
server-only fetch wrapper.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Server Actions for editing and deleting an update

**Files:**

- Modify: `frontend/src/app/applications/actions.ts`

**Interfaces:**

- Consumes: `patchStatusUpdate`, `deleteStatusUpdate` from Task 3; the existing
  `statusUpdateSchema`, `readStatusUpdate` and `FormState` in this file.
- Produces:
  - `FormState` gains `saved?: boolean`.
  - `editStatusUpdateAction(applicationId: string, updateId: string, previous: FormState, formData: FormData) => Promise<FormState>`
  - `deleteStatusUpdateAction(applicationId: string, updateId: string) => Promise<void>`

### Steps

- [ ] **Step 1: Widen `FormState`**

```ts
export type FormState = { errors?: Record<string, string[]>; saved?: boolean };
```

`saved` is what tells the dialog to close. The initial state is `{}`, so "no errors" alone cannot be
read as success - the dialog would close the instant it opened.

- [ ] **Step 2: Add both actions**

Append to `frontend/src/app/applications/actions.ts`, after `addStatusUpdateAction`:

```ts
export async function editStatusUpdateAction(
  applicationId: string,
  updateId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const update = statusUpdateSchema.safeParse(readStatusUpdate(formData));
  if (!update.success) {
    return { errors: z.flattenError(update.error).fieldErrors };
  }

  await patchStatusUpdate(applicationId, updateId, update.data);
  revalidatePath("/", "layout");
  return { saved: true };
}

export async function deleteStatusUpdateAction(applicationId: string, updateId: string) {
  await deleteStatusUpdate(applicationId, updateId);
  revalidatePath("/", "layout");
}
```

Add `deleteStatusUpdate` and `patchStatusUpdate` to the existing `@/lib/api` import, keeping it
alphabetical: `addStatusUpdate, createApplication, deleteApplication, deleteStatusUpdate,
patchApplication, patchStatusUpdate`.

The dialog always submits all three fields, so the existing `statusUpdateSchema` - which requires a
date and a status - is the right validator. The endpoint stays partial-capable regardless.

Neither action redirects. The detail page is already the current route, and `revalidatePath` is what
refreshes the timeline and the list.

- [ ] **Step 3: Typecheck**

Run from `frontend/`: `npx tsc --noEmit`

Expected: silent.

- [ ] **Step 4: Confirm nothing regressed**

Run from `frontend/`: `npm test`

Expected: PASS, unchanged. These actions have no unit tests - they are 6 lines of glue over a
validator that is already covered, and Task 6 drives them end to end.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/applications/actions.ts
git commit -m "Add server actions for editing and deleting an update

Both revalidate the layout so the timeline and the derived status on the list
refresh together. Neither redirects, since the detail page is already the
current route.

FormState gains a saved flag. The dialog needs to tell a successful save from
its own initial state, and an absence of errors cannot do that - the initial
state has none either.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: The edit dialog and the timeline row

**Files:**

- Create: `frontend/src/components/edit-update-dialog.tsx`
- Modify: `frontend/src/app/applications/[id]/page.tsx` (the timeline `<li>`, lines 100-112)

**Interfaces:**

- Consumes: `editStatusUpdateAction`, `deleteStatusUpdateAction`, `FormState` from Task 4;
  `StatusUpdateRead` from `@/lib/api`; `Field` and `selectClasses` from `@/components/field`;
  `STATUSES` from `@/lib/status`; the shadcn `Dialog` family from `@/components/ui/dialog`.
- Produces: `<EditUpdateDialog applicationId={string} update={StatusUpdateRead} deletable={boolean} />`

**Three things that will bite if ignored:**

1. **Field ids must be unique per update.** The add-update form already on the page owns `id="status"`,
   `id="date"` and `id="note"`. An open dialog puts a second set in the DOM. Suffix every id with the
   update id, or the labels bind to the wrong control and Playwright's `getByLabel` goes ambiguous.
2. **The form must unmount when the dialog closes.** `useActionState` keeps its state for the life of
   the component, so a form that survives a close would still be holding `{ saved: true }` on
   reopen and the close-on-save effect would never fire again. shadcn's `DialogContent` does not
   `forceMount`, so putting the form in a child component inside it resets it for free.
3. **Delete cannot be a nested `<form>`.** It shares the dialog with the edit form, and nested forms
   are invalid HTML. React 19's `formAction` on a submit button overrides its form's action, which is
   exactly this case. If it misbehaves, the fallback is a sibling `<form>` in the footer with the
   Save button associated by `form={id}`.

### Steps

- [ ] **Step 1: Write the component**

Create `frontend/src/components/edit-update-dialog.tsx`:

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";

import {
  deleteStatusUpdateAction,
  editStatusUpdateAction,
  type FormState,
} from "@/app/applications/actions";
import { Field, selectClasses } from "@/components/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { StatusUpdateRead } from "@/lib/api";
import { STATUSES } from "@/lib/status";

type Props = {
  applicationId: string;
  update: StatusUpdateRead;
  deletable: boolean;
};

export function EditUpdateDialog({ applicationId, update, deletable }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit status update</DialogTitle>
          <DialogDescription>
            Correct the status, the date or the note. The current status is derived from the newest
            entry, so a changed date can change it.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so useActionState starts clean on every reopen. */}
        <UpdateForm
          applicationId={applicationId}
          update={update}
          deletable={deletable}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function UpdateForm({ applicationId, update, deletable, onSaved }: Props & { onSaved: () => void }) {
  const action = editStatusUpdateAction.bind(null, applicationId, update.id);
  const remove = deleteStatusUpdateAction.bind(null, applicationId, update.id);
  const [state, submit, pending] = useActionState<FormState, FormData>(action, {});
  const errors = state.errors ?? {};

  useEffect(() => {
    if (state.saved) onSaved();
  }, [state.saved, onSaved]);

  // The add-update form on the same page owns the bare ids, so these have to be suffixed.
  const statusId = `status-${update.id}`;
  const dateId = `date-${update.id}`;
  const noteId = `note-${update.id}`;

  return (
    <form action={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name={statusId} label="Status" errors={errors.status}>
          <select
            id={statusId}
            name="status"
            defaultValue={update.status}
            className={selectClasses}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </Field>
        <Field name={dateId} label="Date" errors={errors.date}>
          <Input id={dateId} name="date" type="date" defaultValue={update.date} required />
        </Field>
      </div>
      <Field name={noteId} label="Note" errors={errors.note}>
        <Textarea id={noteId} name="note" rows={3} defaultValue={update.note ?? ""} />
      </Field>
      <DialogFooter>
        {deletable && (
          <Button type="submit" formAction={remove} variant="destructive">
            Delete update
          </Button>
        )}
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save update"}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

`deletable` is `false` for an application's only update, so the button is simply absent rather than
present and failing. The API's 409 stays the authority; this is the honest UI over it.

The button labels are `Save update` and `Delete update`, not `Save` and `Delete`: the detail page
already has a `Delete` button for the whole application and a `Save changes` button on the edit
form, and the E2E locators need to tell them apart.

- [ ] **Step 2: Put an Edit button on each timeline row**

In `frontend/src/app/applications/[id]/page.tsx`, add the import:

```tsx
import { EditUpdateDialog } from "@/components/edit-update-dialog";
```

and replace the timeline `<li>` body with:

```tsx
{application.updates.map((update) => (
  <li key={update.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:gap-4">
    <div className="flex shrink-0 items-center gap-3 sm:w-56">
      <StatusBadge status={update.status} />
      <time dateTime={update.date} className="text-sm text-muted-foreground">
        {formatDate(update.date)}
      </time>
    </div>
    {update.note && (
      <p className="min-w-0 flex-1 text-sm break-words whitespace-pre-line">{update.note}</p>
    )}
    <div className="shrink-0 self-start sm:ml-auto sm:self-center">
      <EditUpdateDialog
        applicationId={application.id}
        update={update}
        deletable={application.updates.length > 1}
      />
    </div>
  </li>
))}
```

`sm:ml-auto` is what keeps the button at the right edge on the rows that carry no note, where the
`flex-1` note paragraph is not there to push it.

- [ ] **Step 3: Typecheck and lint**

Run from `frontend/`:

```bash
npx tsc --noEmit
npm run lint
```

Expected: both silent.

- [ ] **Step 4: Drive it in a browser**

Start both services - backend from `backend/` with `uv run fastapi dev app/main.py`, frontend from
`frontend/` with `npm run dev`. `backend/.env` points at the Neon `dev` branch, which holds a copy of
the 26 real applications.

Create a scratch application through the UI rather than editing a real row, so the dev branch stays
comparable to production. Then check, ticking each:

- [ ] The dialog opens from a timeline row and every field is prefilled with that entry's values
- [ ] Editing only the note leaves the status and date alone, and the dialog closes on save
- [ ] Moving the newest entry's date behind an older one reorders the timeline and changes the badge
      at the top of the page, and the same change shows on the list without a manual refresh
- [ ] Reopening the dialog after a save shows the new values, and saving again still closes it
      (this is the `useActionState` reset - if it stays open, re-read note 2 above)
- [ ] `Cancel` closes without writing
- [ ] `Delete update` removes that entry and the current status re-derives
- [ ] On an application with a single entry, `Delete update` is absent
- [ ] Legible in both light and dark, and the row still fits at 375px width
- [ ] Delete the scratch application when done

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/edit-update-dialog.tsx 'frontend/src/app/applications/[id]/page.tsx'
git commit -m "Edit a timeline entry from a dialog on the detail screen

An Edit button per timeline row opens a three-field dialog. Delete lives
inside it, and is absent on an application's only entry, which is the same
rule the API enforces with a 409.

Field ids are suffixed with the update id. The add-update form on the same
page already owns the bare status, date and note ids, and an open dialog puts
a second set of controls in the DOM.

The form is a child of DialogContent so it unmounts on close. useActionState
keeps state for the life of the component, and a surviving form would still
hold its saved flag on reopen and never close again.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: End-to-end coverage

**Files:**

- Modify: `frontend/e2e/helpers.ts`
- Create: `frontend/e2e/timeline.spec.ts`

**Interfaces:**

- Consumes: `STORAGE_STATE`, `createApplication`, `addUpdate`, `row`, `timeline` from
  `e2e/helpers.ts`.
- Produces:
  - `openUpdateDialog(page: Page, note: string) => Promise<Locator>`
  - `editUpdate(page, note: string, changes: { status?: string; date?: string; note?: string }) => Promise<void>`
  - `deleteUpdate(page: Page, note: string) => Promise<void>`

The suite is `workers: 1` against one shared database and it empties it in setup and teardown, so
these tests can assume nothing about what ran before them and must leave nothing behind.

### Steps

- [ ] **Step 1: Add the helpers**

Append to `frontend/e2e/helpers.ts`:

```ts
/** Rows are addressed by their note - it is the only text that distinguishes one entry visually. */
export async function openUpdateDialog(page: Page, note: string) {
  await timeline(page)
    .getByRole("listitem")
    .filter({ hasText: note })
    .getByRole("button", { name: "Edit" })
    .click();
  return page.getByRole("dialog");
}

export async function editUpdate(
  page: Page,
  note: string,
  changes: { status?: string; date?: string; note?: string },
) {
  const dialog = await openUpdateDialog(page, note);
  if (changes.status) await dialog.getByLabel("Status").selectOption(changes.status);
  if (changes.date) await dialog.getByLabel("Date").fill(changes.date);
  if (changes.note !== undefined) await dialog.getByLabel("Note").fill(changes.note);
  await dialog.getByRole("button", { name: "Save update" }).click();
  // The dialog closing is the signal that the action finished, same reason addUpdate waits.
  await expect(dialog).toBeHidden();
}

export async function deleteUpdate(page: Page, note: string) {
  const entries = timeline(page).getByRole("listitem");
  const before = await entries.count();

  const dialog = await openUpdateDialog(page, note);
  await dialog.getByRole("button", { name: "Delete update" }).click();

  await expect(entries).toHaveCount(before - 1);
}
```

The `getByLabel` calls are scoped to the dialog. Unscoped they would also match the add-update
form's Status, Date and Note on the same page.

- [ ] **Step 2: Write the failing spec**

Create `frontend/e2e/timeline.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import {
  STORAGE_STATE,
  addUpdate,
  createApplication,
  deleteUpdate,
  editUpdate,
  openUpdateDialog,
  row,
  timeline,
} from "./helpers";

test.use({ storageState: STORAGE_STATE });

test("correcting an entry's date re-derives the current status", async ({ page }) => {
  await createApplication(page, { title: "Mistyped date", date: "2026-08-01" });
  await addUpdate(page, "Interview", "2026-08-09", "first round");

  await editUpdate(page, "first round", { date: "2026-07-25" });

  // The Applied entry is now the newest, so it is the one the badge and the list show.
  await expect(timeline(page)).toContainText("25 Jul 2026");
  await page.goto("/");
  const listed = row(page, "Mistyped date");
  await expect(listed).toContainText("Applied");
  await expect(listed).toContainText("1 Aug 2026");
});

test("correcting an entry's status and note persists", async ({ page }) => {
  await createApplication(page, { title: "Wrong status", date: "2026-08-02" });
  await addUpdate(page, "Interview", "2026-08-10", "was actually an offer");

  await editUpdate(page, "was actually an offer", { status: "Offer", note: "offer received" });

  await page.reload();
  await expect(timeline(page)).toContainText("offer received");
  await expect(timeline(page)).not.toContainText("was actually an offer");
  await page.goto("/");
  await expect(row(page, "Wrong status")).toContainText("Offer");
});

test("deleting an entry hands the current status back to the one before it", async ({ page }) => {
  await createApplication(page, { title: "Added by mistake", date: "2026-08-03" });
  await addUpdate(page, "Rejected", "2026-08-12", "wrong application");

  await page.goto("/");
  await expect(row(page, "Added by mistake")).toHaveCount(0);

  await page.goto("/?closed=shown");
  // Each list row is one Link wrapping the whole row, so there is exactly one to click.
  await row(page, "Added by mistake").getByRole("link").click();
  await deleteUpdate(page, "wrong application");

  await expect(timeline(page)).not.toContainText("wrong application");
  await page.goto("/");
  const listed = row(page, "Added by mistake");
  await expect(listed).toContainText("Applied");
  await expect(listed).toContainText("3 Aug 2026");
});

test("the only entry on a timeline offers no delete", async ({ page }) => {
  await createApplication(page, { title: "One entry only", date: "2026-08-04", note: "the only one" });

  const dialog = await openUpdateDialog(page, "the only one");

  await expect(dialog.getByRole("button", { name: "Save update" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Delete update" })).toHaveCount(0);
});
```

The last test needs `createApplication` to fill the first update's note, which it currently does
not. Add `note` to its `fields` type and set it:

```ts
export async function createApplication(
  page: Page,
  fields: {
    title: string;
    company?: string;
    sector?: string;
    location?: string;
    rating?: string;
    status?: string;
    date: string;
    note?: string;
  },
): Promise<void> {
```

and, after the `Date` fill and before the submit click:

```ts
  if (fields.note) await page.getByLabel("Note").fill(fields.note);
```

`row()` returns the `<li>`, and `src/app/page.tsx` renders one `<Link>` filling each one, so
`getByRole("link")` inside it is unambiguous and needs no `.first()`.

- [ ] **Step 3: Run the new spec to verify it fails, then passes**

Run from `frontend/`: `npx playwright test timeline.spec.ts`

Playwright builds the frontend and starts both services itself, on 3100 and 8100, against the Neon
`test` branch from `TEST_DATABASE_URL`. First run takes a couple of minutes.

Run it once **before** the helpers exist to see it fail on the missing import, then after Step 1 and
2 are complete. Expected: 4 passed.

- [ ] **Step 4: Run everything**

Run from `frontend/`: `npm run test:e2e`

Expected: 16 tests passed - the existing 12 plus these 4. Then run it a second time with no cleanup
in between; it must pass identically, which is what proves the new tests leave no residue.

Watch specifically for `getByRole("button", { name: "Delete" })` in
`applications.spec.ts::deleting removes the application and its timeline` going ambiguous. It should
not: the per-row control is named `Edit`, and `Delete update` only exists inside an open dialog. If
it does resolve to more than one element, scope that existing locator rather than renaming the new
buttons.

- [ ] **Step 5: Commit**

```bash
git add frontend/e2e/helpers.ts frontend/e2e/timeline.spec.ts
git commit -m "Cover editing and deleting a timeline entry end to end

Four cases: a corrected date re-deriving the current status, a corrected
status and note surviving a reload, a deleted entry handing the status back
to the one before it, and no delete button on an application's only entry.

Entries are addressed by their note, and the label lookups are scoped to the
dialog - the add-update form on the same page carries a Status, Date and Note
of its own.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Update the specification

**Files:**

- Modify: `AGENTS.md` (lines 34-36, 66-68, 169-180, 310-323, 367-368)

Four passages currently say this feature does not exist. `AGENTS.md` is the spec every future
session reads, so leaving them is worse than not shipping the feature.

### Steps

- [ ] **Step 1: The always-one-update invariant**

Extend the bullet at line 34 so the guard is stated where the invariant is:

```markdown
- **An application always has at least one status update.** Creating an application creates its
  first update in the same transaction. There is no such thing as a statusless application, so
  deleting the last remaining update is refused with a `409`.
```

- [ ] **Step 2: The detail screen**

Item 3 of the Screens list becomes:

```markdown
3. **Application detail** - all fields, the job posting link, and the full status timeline in reverse
   chronological order. Add a status update from here; correct or delete an existing one from a
   dialog on the same screen.
```

- [ ] **Step 3: The API table and the paragraph under it**

Add two rows to the table, and replace the paragraph at lines 179-180:

```markdown
| `POST`   | `/applications/{id}/status-updates`             | Append a status update                |
| `PATCH`  | `/applications/{id}/status-updates/{update_id}` | Edit one timeline entry               |
| `DELETE` | `/applications/{id}/status-updates/{update_id}` | Delete one entry, never the last      |

A status update is addressed through its application, so an update id under the wrong application is
a `404` rather than a cross-record write. Deleting an application's only update is a `409`: the
current status is derived from the timeline, so an empty one has nothing to derive from.
```

- [ ] **Step 4: The testing focus**

Add to the **pytest** list:

```markdown
- The last-remaining-update guard, and that an update cannot be edited or deleted through another
  application's id
- That editing a date does not rewrite `created_at`, so an entry edited into a same-date tie still
  resolves by original write order
```

And extend the **Playwright** paragraph:

```markdown
**Playwright** - login, create an application with its first status update, add a second update and
see the current status change, correct and delete a timeline entry, `Hide closed` toggle behaviour,
edit, delete. Runs against both services, which means the suite starts two processes.
```

- [ ] **Step 5: The deferred decision**

Replace the append-only bullet at lines 367-368:

```markdown
- **A status update has no route of its own.** Editing and deleting one happens in a dialog on the
  detail screen rather than at a dedicated URL, because the form is three fields. The consequence is
  that an edit is not linkable and not resumable, which for one user correcting a typo is fine.
- **An edit never rewrites `created_at`.** An entry edited onto a date it now shares with another
  still ties by original write order. Correct, but not obvious from the UI, which shows no times.
```

- [ ] **Step 6: Check the whole file still reads consistently**

```bash
grep -rn "append-only\|cannot be edited\|append only" AGENTS.md
```

Expected: no matches. Anything left is a passage this task missed.

- [ ] **Step 7: Commit**

```bash
git add AGENTS.md
git commit -m "Retire the append-only timeline from the spec

Four passages said a status update could not be edited or deleted. The two
new routes are in the API table, the last-update guard sits with the
invariant it protects, and the deferred decision now records what was
actually chosen: a dialog rather than a route of its own, and an edit that
leaves created_at alone.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Deploy and smoke-test production

No migration: this increment changed no columns, so `alembic upgrade head` has nothing to do. The
backend goes out first, because the frontend starts calling the two new routes the moment it lands.

### Steps

- [ ] **Step 1: Confirm everything is green and the tree is clean**

```bash
cd backend && uv run pytest -q && uv run ruff check . && uv run ruff format --check .
cd ../frontend && npm test && npm run lint && npx tsc --noEmit && npm run test:e2e
git status --short
```

Expected: 62 pytest, Vitest unchanged, 16 Playwright. `git status` shows only the pre-existing
`skills-lock.json` and skills directories.

- [ ] **Step 2: Merge to `main`**

```bash
git switch main && git merge --no-ff edit-application-timeline
```

- [ ] **Step 3: Confirm the project names**

```bash
vercel project ls
```

Expected: `job-application-assistant-api` and `job-application-assistant`. Use whatever this prints,
not what is written below, if they differ.

- [ ] **Step 4: Deploy the backend, then verify the routes exist**

From the repository root - both projects deploy from here, since the frontend build reads
`backend/openapi.json`:

```bash
vercel deploy --prod --project job-application-assistant-api
curl -s -o /dev/null -w "%{http_code}\n" https://job-application-assistant-api.vercel.app/health
curl -s https://job-application-assistant-api.vercel.app/openapi.json | grep -c "status-updates/{update_id}"
```

Expected: `200`, and a non-zero grep count. Also confirm the service still refuses an anonymous
caller:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE \
  "https://job-application-assistant-api.vercel.app/applications/00000000-0000-0000-0000-000000000000/status-updates/00000000-0000-0000-0000-000000000000"
```

Expected: `401` - not `404`. The key check runs before the lookup.

- [ ] **Step 5: Deploy the frontend**

```bash
vercel deploy --prod --project job-application-assistant
```

- [ ] **Step 6: Smoke-test against production**

Log in at https://job-application-assistant-ten.vercel.app with the real `APP_PASSWORD`. Use a
throwaway record for the whole flow - the 26 real applications must not be touched.

- [ ] The list still shows 26 applications with `Hide closed` off, 9 of them closed
- [ ] Create a throwaway application, add a second update, then edit that update's date to before
      the first one; the badge and the list both follow
- [ ] Delete that update; the current status reverts
- [ ] The remaining single entry offers no `Delete update`
- [ ] Delete the throwaway application
- [ ] The list is back to 26

- [ ] **Step 7: Push**

```bash
git push origin main
```

- [ ] **Step 8: Record the outcome**

Append an `## Outcome` section to this plan file: the deployment URLs, anything that behaved
differently from what the plan assumed, and anything a later increment should know. The `12-08-2026`
plan's per-phase outcome notes are the model - they are where the non-obvious findings live, and
they are worth more than the ticked boxes.

```bash
git add .agents/plans/14-08-2026-edit-application-timeline.md
git commit -m "Record the timeline-editing outcome

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
```

---

## Risks

**`session.refresh` may not reorder the collection.** The PATCH response's `current_status` reads
`updates[0]`, which is ordered by the relationship, not re-sorted in Python. If the refresh does not
expire the loaded collection, the response returns the pre-edit order while the database is correct -
a bug visible only in the response body.
`test_patch_moving_a_date_back_moves_the_current_status` asserts the response order directly, which
is what catches it. Fallback: `session.expire(application, ["updates"])`.

**Duplicate DOM ids.** The add-update form and an open dialog both want `id="status"`. The suffixing
in Task 5 is not cosmetic - without it labels bind to the wrong control and the Playwright
`getByLabel` calls resolve to two elements.

**`formAction` on the delete button.** One form, two destinations. React 19 supports it, but the
delete path bypasses `useActionState`, so it reports no pending state. Acceptable: the row vanishes
on success. If it does not fire at all, split it into a sibling form.

**The 409 is reachable only by a client that ignores the UI.** The button is hidden when there is one
update, so the guard is exercised by pytest, not by the browser. That is the right split - the API is
the authority and is tested as one - but it does mean nobody sees the error message. It is not
surfaced anywhere, deliberately.

**A dialog per timeline row.** An application with a long timeline mounts one `Dialog` per entry.
Radix only renders content for the open one, so the cost is a trigger button each. At the observed
maximum of four entries per application this is nothing; it would matter at hundreds.

---

## Outcome

Shipped 15 August 2026. Eight commits on `edit-application-timeline`, merged to `main` as `fdc7a69`
(`--no-ff`) and pushed. Final gates: 62 pytest, 19 Vitest, 16 Playwright (run twice back to back),
`ruff` and `eslint` and `tsc` all clean.

**Deployments**

| Project                         | Alias                                              | Deployment                                              |
| ------------------------------- | -------------------------------------------------- | ------------------------------------------------------- |
| `job-application-assistant-api` | https://job-application-assistant-api.vercel.app   | `job-application-assistant-35vro312x-team-6372` (READY) |
| `job-application-assistant`     | https://job-application-assistant-ten.vercel.app   | `job-application-assistant-5fgek7a41-team-6372` (READY) |

Production verified: `/health` 200, one `status-updates/{update_id}` path in the served
`openapi.json`, and anonymous `PATCH` and `DELETE` on the new routes both `401` rather than `404` -
the key check runs before the lookup. Smoke test on a throwaway record covered create, add a second
update, edit its date behind the first (badge and list both re-derived), delete the newest entry
(status reverted), and no `Delete update` on the last remaining entry. Throwaway removed; the list
is back to 26 applications and 39 status updates, unchanged from before the test.

### What the plan got wrong

**`deleteUpdate` in `e2e/helpers.ts` was broken as written, and the suite caught it.**
`Locator.count()` does not auto-wait. Called immediately after clicking through from the list to the
detail screen it returned `0`, so `toHaveCount(before - 1)` waited for `-1` elements and timed out
after the delete had already succeeded. Fixed with `await expect(entries.first()).toBeVisible()`
before the count. Worth remembering for any future helper that reads a count straight after a
navigation - `addUpdate` only gets away with it because the page is already loaded.

**`session.refresh` did reorder the collection.** The documented risk did not materialise and the
`session.expire(application, ["updates"])` fallback was not needed.
`test_patch_moving_a_date_back_moves_the_current_status` passes against the plain refresh.

**Neither the repo root nor `frontend/` was linked to Vercel**, only `backend/`. And the backend
project's root directory is `backend`, so running `vercel deploy --prod` from inside `backend/`
fails with `path "...\backend\backend" does not exist`. Both projects genuinely do deploy from the
repository root, as the plan said - but the root has to be linked first. The recipe that worked:
write `.vercel/project.json` at the repo root with the target project's ids (`vercel project inspect
<name>` prints the id), run `vercel deploy --prod`, then repoint the file at the other project and
repeat. The root `.vercel/` was removed afterwards rather than left pointing at one of the two
projects, which would silently decide what a bare `vercel deploy` deploys.

**The closed count has drifted.** The plan expected 9 closed of 26; production now has 11 closed and
15 open. Real usage, not a defect - but a smoke-test step that hard-codes a count will keep going
stale.

### Environment findings, not plan defects

**Postgres on 5432 could not reach Neon from the development machine.** TCP connected and then the
connection was reset or black-holed, for both the dev and test branches, for the Postgres wire
protocol and for arbitrary bytes alike. The database itself was healthy throughout - Neon's
SQL-over-HTTP endpoint on 443 answered normally, which is a useful way to tell "Neon is down" from
"5432 is blocked" apart. Every test in this increment therefore ran against a local
`postgres:17-alpine` container on port 55432, migrated with `alembic upgrade head`. The full 45-test
baseline passed against it unchanged before any code was written, so it is a faithful stand-in.
`TEST_DATABASE_URL` in `backend/.env` was temporarily repointed for the Playwright runs, because
`playwright.config.ts` reads that file directly rather than the environment; it has been restored.

**`fastapi dev` crashes on Windows when its output is redirected.** It writes an emoji banner through
`rich`, which encodes to cp1252 on a redirected stream and raises `UnicodeEncodeError` before the
server starts. `PYTHONIOENCODING=utf-8` fixes it. Only affects redirected local runs, not Vercel.

**Some `_rsc` prefetch requests returned 503** on the production frontend right after deploy, on the
`/applications/{id}/edit` route, mixed with 200s for the same URL. Consistent with serverless cold
starts on a just-deployed function; nothing user-visible was observed. Worth a second look if it
persists beyond the minutes after a deploy.

### For the next increment

The `409` on deleting the last update is still only reachable by a client that ignores the UI, and
still surfaces no message anywhere. That remains deliberate. If a second write path to the timeline
ever appears, that decision needs revisiting, because then the button-hiding and the guard could
disagree.
