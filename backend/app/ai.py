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
