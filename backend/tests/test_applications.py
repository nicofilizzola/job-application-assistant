import datetime
import uuid

import pytest
from sqlalchemy import func, select

from app.main import app
from app.models import Application, StatusUpdate

FIELDS = {
    "title": "Backend engineer",
    "company": "ACME",
    "sector": "Tech",
    "location": "Paris",
}


def payload(**overrides) -> dict:
    body = FIELDS | {"first_update": {"date": "2026-08-01", "status": "Applied"}}
    return body | overrides


def on(day: int, status: str, note: str | None = None) -> dict:
    return {"date": datetime.date(2026, 8, day), "status": status, "note": note}


async def create(client, **overrides) -> str:
    response = await client.post("/applications", json=payload(**overrides))
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_openapi_exposes_exactly_the_seven_routes():
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
    }


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/applications"),
        ("POST", "/applications"),
        ("GET", "/applications/{id}"),
        ("PATCH", "/applications/{id}"),
        ("DELETE", "/applications/{id}"),
        ("POST", "/applications/{id}/status-updates"),
    ],
)
async def test_every_application_route_requires_the_api_key(anonymous_client, method, path):
    url = path.format(id=uuid.uuid4())
    body = payload() if method in {"POST", "PATCH"} else None
    response = await anonymous_client.request(method, url, json=body)
    assert response.status_code == 401


async def test_health_needs_no_api_key(anonymous_client):
    assert (await anonymous_client.get("/health")).status_code == 200


async def test_create_returns_the_application_with_its_first_update(client):
    response = await client.post("/applications", json=payload(rating=4.5, link="https://x.test"))

    assert response.status_code == 201
    body = response.json()
    assert body["rating"] == 4.5
    assert body["current_status"] == "Applied"
    assert body["last_update_date"] == "2026-08-01"
    assert [(u["date"], u["status"]) for u in body["updates"]] == [("2026-08-01", "Applied")]


async def test_detail_lists_the_timeline_newest_first(client):
    application_id = await create(client)
    await client.post(
        f"/applications/{application_id}/status-updates",
        json={"date": "2026-08-09", "status": "Interview", "note": "went well"},
    )
    await client.post(
        f"/applications/{application_id}/status-updates",
        json={"date": "2026-08-05", "status": "Contacted"},
    )

    body = (await client.get(f"/applications/{application_id}")).json()

    assert [u["date"] for u in body["updates"]] == ["2026-08-09", "2026-08-05", "2026-08-01"]
    assert body["current_status"] == "Interview"
    assert body["last_update_date"] == "2026-08-09"


async def test_adding_an_update_moves_the_current_status(client):
    application_id = await create(client)

    await client.post(
        f"/applications/{application_id}/status-updates",
        json={"date": "2026-08-20", "status": "Offer"},
    )

    listed = (await client.get("/applications")).json()
    assert listed[0]["current_status"] == "Offer"
    assert listed[0]["last_update_date"] == "2026-08-20"


@pytest.mark.parametrize(
    ("first", "second"),
    [("Interview", "Rejected"), ("Rejected", "Interview")],
)
async def test_same_date_tiebreak_prefers_the_later_created_at(client, first, second):
    """Both orders, so an ordering that happens to be right by accident cannot pass."""
    application_id = await create(client, first_update={"date": "2026-08-11", "status": first})
    await client.post(
        f"/applications/{application_id}/status-updates",
        json={"date": "2026-08-11", "status": second},
    )

    detail = (await client.get(f"/applications/{application_id}")).json()
    assert detail["current_status"] == second

    listed = (await client.get("/applications", params={"include_closed": True})).json()
    assert listed[0]["current_status"] == second


@pytest.mark.parametrize("rows", [1, 5, 20])
async def test_list_issues_one_query_whatever_the_row_count(client, seed, count_statements, rows):
    for index in range(rows):
        seed([on(1, "Applied")], title=f"Role {index}")

    with count_statements() as statements:
        response = await client.get("/applications")

    assert len(response.json()) == rows
    selects = [s for s in statements if s.lstrip().upper().startswith("SELECT")]
    assert len(selects) == 1, selects


async def test_failed_status_update_leaves_no_orphaned_application(
    client, break_status_update_inserts, session
):
    with break_status_update_inserts(), pytest.raises(RuntimeError):
        await client.post("/applications", json=payload())

    assert session.execute(select(func.count()).select_from(Application)).scalar() == 0


async def test_include_closed_selects_exactly_the_closed_statuses(client, seed):
    seed([on(1, "Applied")], title="Applied")
    seed([on(2, "Contacted")], title="Contacted")
    seed([on(3, "Interview")], title="Interview")
    seed([on(4, "Offer")], title="Offer")
    seed([on(5, "Rejected")], title="Rejected")
    seed([on(6, "Withdrawn")], title="Withdrawn")

    open_only = (await client.get("/applications")).json()
    assert {row["title"] for row in open_only} == {"Applied", "Contacted", "Interview", "Offer"}

    everything = (await client.get("/applications", params={"include_closed": True})).json()
    assert len(everything) == 6


async def test_list_is_ordered_by_most_recent_update_first(client, seed):
    seed([on(1, "Applied")], title="Oldest")
    seed([on(20, "Applied")], title="Newest")
    seed([on(10, "Applied")], title="Middle")

    listed = (await client.get("/applications")).json()

    assert [row["title"] for row in listed] == ["Newest", "Middle", "Oldest"]


@pytest.mark.parametrize("method", ["GET", "PATCH", "DELETE"])
async def test_unknown_id_is_404(client, method):
    url = f"/applications/{uuid.uuid4()}"
    body = {"title": "Renamed"} if method == "PATCH" else None

    assert (await client.request(method, url, json=body)).status_code == 404


async def test_status_update_on_an_unknown_application_is_404(client):
    response = await client.post(
        f"/applications/{uuid.uuid4()}/status-updates",
        json={"date": "2026-08-01", "status": "Applied"},
    )
    assert response.status_code == 404


async def test_delete_removes_the_application_and_its_updates(client, session):
    application_id = await create(client)
    await client.post(
        f"/applications/{application_id}/status-updates",
        json={"date": "2026-08-05", "status": "Interview"},
    )

    assert (await client.delete(f"/applications/{application_id}")).status_code == 204

    assert (await client.get(f"/applications/{application_id}")).status_code == 404
    assert session.execute(select(func.count()).select_from(StatusUpdate)).scalar() == 0


async def test_patch_changes_only_what_it_is_given(client):
    application_id = await create(client, comment="original")

    response = await client.patch(
        f"/applications/{application_id}", json={"title": "Staff engineer", "comment": None}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Staff engineer"
    assert body["comment"] is None
    assert body["company"] == "ACME"
    assert body["current_status"] == "Applied"


async def test_patch_cannot_null_a_required_field(client):
    application_id = await create(client)

    response = await client.patch(f"/applications/{application_id}", json={"title": None})

    assert response.status_code == 422


@pytest.mark.parametrize("rating", [1, 2.5, 4.5, 5])
async def test_ratings_on_a_half_step_are_accepted(client, rating):
    response = await client.post("/applications", json=payload(rating=rating))

    assert response.status_code == 201
    assert response.json()["rating"] == rating


@pytest.mark.parametrize("rating", [0, 0.5, 5.5, 6, 4.3, -1])
async def test_ratings_off_the_scale_or_off_the_step_are_422(client, rating):
    assert (await client.post("/applications", json=payload(rating=rating))).status_code == 422


async def test_patch_validates_the_rating_too(client):
    application_id = await create(client)

    assert (
        await client.patch(f"/applications/{application_id}", json={"rating": 3.3})
    ).status_code == 422


async def test_unknown_status_is_422(client):
    response = await client.post(
        "/applications", json=payload(first_update={"date": "2026-08-01", "status": "Ghosted"})
    )
    assert response.status_code == 422
