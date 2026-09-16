import uuid

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

    response = await client.post("/job-ads/resume", json={"text": ADVERT})

    # Asserted before the row count, or this passes while the route does not exist at all.
    assert response.status_code == 200
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
