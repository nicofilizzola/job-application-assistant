from fastapi import FastAPI

from app.routers import applications

app = FastAPI(title="Job Application Assistant")
app.include_router(applications.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
