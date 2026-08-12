from fastapi import FastAPI

app = FastAPI(title="Job Application Assistant")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
