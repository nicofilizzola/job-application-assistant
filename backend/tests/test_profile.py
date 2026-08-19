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
