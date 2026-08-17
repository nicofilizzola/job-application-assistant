from fastapi import FastAPI

from app.routers import applications, profile

app = FastAPI(title="Job Application Assistant")
app.include_router(applications.router)
app.include_router(profile.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
