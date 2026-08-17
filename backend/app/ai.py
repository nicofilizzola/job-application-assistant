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
    # Two on one side and one on the other, so the end-to-end suite proves the columns fill
    # independently. No entry is a substring of another: Playwright's getByText would match both.
    match_strengths=["Stubbed strength", "Another stubbed point"],
    match_weaknesses=["Stubbed weakness"],
)


Analyser = Callable[[str, str], JobAnalysis]


def get_analyser() -> Analyser:
    if settings.ai_stub:
        return lambda ad_text, profile: STUB
    return analyse


AnalyserDep = Annotated[Analyser, Depends(get_analyser)]
