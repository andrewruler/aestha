from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
import time
import os

app = FastAPI(title="Aestha AI Backend")

# Enable CORS so your Expo app can talk to this server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    # Automatically sends browser users to the API documentation
    return RedirectResponse(url='/docs')

@app.get("/health")
def health():
    return {"status": "online", "schema_version": "v1"}

@app.post("/analyze")
async def analyze(image: UploadFile = File(...)):
    content = await image.read()
    
    # This matches the 'contract' Member A is building against
    return {
        "schema_version": "v1",
        "request_id": str(int(time.time())),
        "status": "success",
        "analysis": {
            "size_bytes": len(content),
            "notes": "Backend reached. Image received."
        }
    }