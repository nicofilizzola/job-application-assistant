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
