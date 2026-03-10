from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import os
import time

app = FastAPI()

# Dev-friendly CORS. Later restrict to your app domains.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/analyze")
async def analyze(image: UploadFile = File(...)):
    content = await image.read()
    size_bytes = len(content)

    return {
        "schema_version": "v1",
        "request_id": str(int(time.time() * 1000)),
        "filename": image.filename,
        "content_type": image.content_type,
        "size_bytes": size_bytes,
        "analysis": {
            "status": "stub",
            "notes": "Upload pipeline working"
        }
    }